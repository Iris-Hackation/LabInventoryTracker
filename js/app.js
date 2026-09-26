
/* ============================================================
   SCIENCE LAB INVENTORY SYSTEM
   MAIN JAVASCRIPT
   ------------------------------------------------------------
   Supabase-backed version.
   - Supabase Auth handles login/session state.
   - Supabase Postgres stores materials, transactions and orders.
   - A small in-memory cache keeps the existing UI functions simple.
   - The existing local JSON remains only as seed/fallback data.
   ============================================================ */

const APP = {
    // The visible username is kept as "labassistant" for this prototype.
    // Supabase Auth uses this technical email behind the scenes.
    authEmail: "labassistant@labinventory.local",
    labs: ["physics", "chemistry", "biology"]
};

const DB = {
    materials: [],
    transactions: [],
    orders: [],
    initialized: false
};

const DEFAULT_MATERIALS = [
    {id:"PHY-001",name:"Vernier Caliper",lab:"physics",category:"Measuring Instruments",type:"reusable",unit:"pieces",quantity:12,totalQuantity:12,availableQuantity:12,issuedQuantity:0,damagedQuantity:0,minimumStock:4,expiryDate:null,status:"active"},
    {id:"PHY-002",name:"Digital Multimeter",lab:"physics",category:"Electrical Instruments",type:"reusable",unit:"pieces",quantity:8,totalQuantity:8,availableQuantity:8,issuedQuantity:0,damagedQuantity:0,minimumStock:3,expiryDate:null,status:"active"},
    {id:"PHY-003",name:"Convex Lens Set",lab:"physics",category:"Optics",type:"reusable",unit:"sets",quantity:6,totalQuantity:6,availableQuantity:6,issuedQuantity:0,damagedQuantity:0,minimumStock:2,expiryDate:null,status:"active"},
    {id:"CHE-001",name:"Hydrochloric Acid",lab:"chemistry",category:"Acids",type:"consumable",unit:"litres",quantity:5,totalQuantity:5,availableQuantity:5,issuedQuantity:0,damagedQuantity:0,minimumStock:2,expiryDate:"2027-03-15",batches:[{batchId:"CHE-001-B01",dateAdded:"2026-09-01",quantityAdded:5,quantityRemaining:5,expiryDate:"2027-03-15"}],status:"active"},
    {id:"CHE-002",name:"Sodium Hydroxide",lab:"chemistry",category:"Bases",type:"consumable",unit:"kg",quantity:3,totalQuantity:3,availableQuantity:3,issuedQuantity:0,damagedQuantity:0,minimumStock:1,expiryDate:"2027-06-20",batches:[{batchId:"CHE-002-B01",dateAdded:"2026-09-01",quantityAdded:3,quantityRemaining:3,expiryDate:"2027-06-20"}],status:"active"},
    {id:"CHE-003",name:"Copper Sulphate",lab:"chemistry",category:"Salts",type:"consumable",unit:"kg",quantity:0.8,totalQuantity:0.8,availableQuantity:0.8,issuedQuantity:0,damagedQuantity:0,minimumStock:1,expiryDate:"2027-01-10",batches:[{batchId:"CHE-003-B01",dateAdded:"2026-09-01",quantityAdded:0.8,quantityRemaining:0.8,expiryDate:"2027-01-10"}],status:"active"},
    {id:"BIO-001",name:"Compound Microscope",lab:"biology",category:"Microscopes",type:"reusable",unit:"pieces",quantity:10,totalQuantity:10,availableQuantity:10,issuedQuantity:0,damagedQuantity:0,minimumStock:3,expiryDate:null,status:"active"},
    {id:"BIO-002",name:"Glass Microscope Slides",lab:"biology",category:"Microscopy",type:"reusable",unit:"boxes",quantity:6,totalQuantity:6,availableQuantity:6,issuedQuantity:0,damagedQuantity:0,minimumStock:2,expiryDate:null,status:"active"},
    {id:"BIO-003",name:"Dissection Kit",lab:"biology",category:"Dissection Equipment",type:"reusable",unit:"sets",quantity:7,totalQuantity:7,availableQuantity:7,issuedQuantity:0,damagedQuantity:0,minimumStock:2,expiryDate:null,status:"active"}
];

document.addEventListener("DOMContentLoaded", async () => {
    const page = location.pathname.split("/").pop() || "index.html";

    const allowed = await protectPages();
    if (!allowed) return;

    // The login page must NOT query protected tables while signed out.
    // This prevents an RLS error/alert from appearing before login.
    bindGlobalEvents();

    if (page === "index.html") {
        return;
    }

    const ready = await initializeData();
    if (!ready) return;

    await setCurrentUsername();
    initializePage();
});

/* ============================================================
   LOGIN / SESSION
   ============================================================ */

async function isLoggedIn() {
    try {
        if (!window.supabaseClient || !window.supabaseClient.auth) {
            console.error("Supabase client is not available.");
            return false;
        }

        const { data, error } =
            await supabaseClient.auth.getSession();

        if (error) {
            console.error("Session error:", error);
            return false;
        }

        return !!data?.session;
    } catch (error) {
        console.error("Session check failed:", error);
        return false;
    }
}

async function protectPages() {
    const page =
        location.pathname.split("/").pop() || "index.html";

    const protectedPages = [
        "dashboard.html",
        "inventory.html",
        "material.html",
        "reports.html",
        "orders.html",
        "notifications.html"
    ];

    const loggedIn = await isLoggedIn();

    if (protectedPages.includes(page) && !loggedIn) {
        window.location.href = "index.html";
        return false;
    }

    if (page === "index.html" && loggedIn) {
        window.location.href = "dashboard.html";
        return false;
    }

    return true;
}

function bindGlobalEvents() {
    const loginForm = document.getElementById("loginForm");

    if (loginForm && loginForm.dataset.bound !== "true") {
        loginForm.addEventListener("submit", handleLogin);
        loginForm.dataset.bound = "true";
    }

    // Modal overlay close behavior.
    if (document.body.dataset.globalEventsBound !== "true") {
        document.addEventListener("click", (event) => {
            const overlay = event.target.closest(".modal-overlay");

            if (overlay && event.target === overlay) {
                overlay.classList.add("hidden");
            }
        });

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                document
                    .querySelectorAll(".modal-overlay")
                    .forEach(m => m.classList.add("hidden"));
            }
        });

        document.body.dataset.globalEventsBound = "true";
    }
}

async function handleLogin(event) {
    event.preventDefault();

    const username =
        document.getElementById("username")?.value.trim() || "";

    const password =
        document.getElementById("password")?.value || "";

    const error =
        document.getElementById("loginError");

    if (!username || !password) {
        showError(error, "Enter your username and password.");
        return;
    }

    // Keep the original username UX while authenticating through Supabase.
    const email =
        username.includes("@")
            ? username
            : APP.authEmail;

    const { error: authError } =
        await supabaseClient.auth.signInWithPassword({
            email,
            password
        });

    if (authError) {
        console.error("Login error:", authError);

        showError(
            error,
            "Incorrect username or password."
        );

        return;
    }

    window.location.href = "dashboard.html";
}

async function logout() {
    try {
        await supabaseClient.auth.signOut();
    } catch (error) {
        console.error("Logout error:", error);
    } finally {
        DB.materials = [];
        DB.transactions = [];
        DB.orders = [];
        DB.initialized = false;
        window.location.href = "index.html";
    }
}

async function setCurrentUsername() {
    try {
        const { data, error } =
            await supabaseClient.auth.getUser();

        if (error) {
            console.error("Could not get user:", error);
        }

        const username =
            data?.user?.user_metadata?.username ||
            "labassistant";

        document
            .querySelectorAll("#currentUsername")
            .forEach(el => {
                el.textContent = username;
            });
    } catch (error) {
        console.error("Could not read current user:", error);
    }
}

/* ============================================================
   SUPABASE DATA STORAGE
   ============================================================ */

async function initializeData() {
    if (DB.initialized) return true;

    try {
        const [materialsResult, transactionsResult, ordersResult] =
            await Promise.all([
                supabaseClient
                    .from("materials")
                    .select("*")
                    .order("id"),

                supabaseClient
                    .from("transactions")
                    .select("*")
                    .order("created_at", { ascending: true }),

                supabaseClient
                    .from("orders")
                    .select("*")
                    .order("created_at", { ascending: true })
            ]);

        if (
            materialsResult.error ||
            transactionsResult.error ||
            ordersResult.error
        ) {
            const dbError =
                materialsResult.error ||
                transactionsResult.error ||
                ordersResult.error;

            console.error("Supabase load error:", dbError);

            alert(
                "The app could not load its Supabase data. " +
                "Check that you are logged in and the SQL/RLS setup is correct."
            );

            return false;
        }

        DB.materials =
            normalizeMaterials(
                materialsResult.data || []
            );

        DB.transactions =
            (transactionsResult.data || [])
                .map(fromDbTransaction);

        DB.orders =
            (ordersResult.data || [])
                .map(fromDbOrder);

        /*
         * --------------------------------------------------------
         * SEED ONLY MISSING SAMPLE MATERIALS
         * --------------------------------------------------------
         *
         * The previous version seeded only when the entire table
         * was empty. Because your database already had 3 chemistry
         * rows, the missing sample rows were never inserted.
         *
         * We now merge the built-in defaults with materials.json
         * (when present), then insert ONLY IDs not already in the
         * Supabase table. Existing rows are left untouched.
         * --------------------------------------------------------
         */

        let fileMaterials = [];

        try {
            const response =
                await fetch(
                    "data/materials.json",
                    { cache: "no-store" }
                );

            if (response.ok) {
                const json =
                    await response.json();

                if (Array.isArray(json)) {
                    fileMaterials = json;
                }
            }
        } catch (error) {
            // materials.json is optional.
        }

        const seedMap =
            new Map(
                DEFAULT_MATERIALS.map(
                    item => [item.id, item]
                )
            );

        fileMaterials.forEach(item => {
            if (item?.id) {
                seedMap.set(item.id, item);
            }
        });

        const existingIds =
            new Set(
                DB.materials.map(
                    material => material.id
                )
            );

        const missingSeedMaterials =
            normalizeMaterials(
                Array.from(seedMap.values())
            ).filter(
                material =>
                    !existingIds.has(material.id)
            );

        if (missingSeedMaterials.length) {
            const { error } =
                await supabaseClient
                    .from("materials")
                    .upsert(
                        missingSeedMaterials.map(
                            toDbMaterial
                        ),
                        { onConflict: "id" }
                    );

            if (error) {
                console.error(
                    "Supabase sample-data seed error:",
                    error
                );
            } else {
                DB.materials =
                    normalizeMaterials([
                        ...DB.materials,
                        ...missingSeedMaterials
                    ]);
            }
        }

        DB.initialized = true;
        return true;

    } catch (error) {
        console.error(
            "Unexpected Supabase initialization error:",
            error
        );

        alert(
            "The application could not connect to Supabase. " +
            "Open the browser console for the exact error."
        );

        return false;
    }
}

function normalizeMaterials(items) {
    if (!Array.isArray(items)) return [];

    return items.map(item => {
        const m = { ...item };

        m.type =
            String(
                m.type || "reusable"
            ).toLowerCase();

        m.quantity =
            Number.isFinite(Number(m.quantity))
                ? Number(m.quantity)
                : 0;

        m.minimumStock =
            Number(
                m.minimum_stock ??
                m.minimumStock ??
                0
            );

        m.totalQuantity =
            Number(
                m.total_quantity ??
                m.totalQuantity ??
                m.quantity
            );

        m.availableQuantity =
            Number(
                m.available_quantity ??
                m.availableQuantity ??
                m.quantity
            );

        m.issuedQuantity =
            Number(
                m.issued_quantity ??
                m.issuedQuantity ??
                0
            );

        m.damagedQuantity =
            Number(
                m.damaged_quantity ??
                m.damagedQuantity ??
                0
            );

        m.expiryDate =
            m.expiry_date ??
            m.expiryDate ??
            null;

        m.status =
            m.status || "active";

        if (typeof m.batches === "string") {
            try {
                m.batches =
                    JSON.parse(m.batches);
            } catch (error) {
                m.batches = [];
            }
        }

        m.batches =
            Array.isArray(m.batches)
                ? m.batches
                    .map(batch => ({
                        ...batch,
                        quantityAdded: Number(batch.quantityAdded || 0),
                        quantityRemaining: Number(batch.quantityRemaining || 0)
                    }))
                    .filter(
                        batch =>
                            batch &&
                            Number(batch.quantityRemaining) > 0
                    )
                : [];

        if (m.type === "consumable") {
            // Consumables use current quantity as available quantity.
            m.totalQuantity =
                Number(m.quantity || 0);

            m.availableQuantity =
                Number(m.quantity || 0);

            m.issuedQuantity = 0;
        } else {
            m.expiryDate = null;
        }

        return m;
    });
}

function toDbMaterial(m) {
    return {
        id: m.id,
        name: String(m.name || "").trim(),
        lab: m.lab,
        category: String(m.category || "").trim(),
        type: m.type,
        unit: String(m.unit || "").trim(),
        quantity: Number(m.quantity || 0),
        total_quantity: Number(m.totalQuantity || 0),
        available_quantity: Number(m.availableQuantity || 0),
        issued_quantity: Number(m.issuedQuantity || 0),
        damaged_quantity: Number(m.damagedQuantity || 0),
        minimum_stock: Number(m.minimumStock || 0),
        expiry_date: m.expiryDate || null,
        batches: Array.isArray(m.batches) ? m.batches : [],
        status: m.status || "active",
        updated_at: new Date().toISOString()
    };
}

async function saveMaterials(materials) {
    const normalized =
        normalizeMaterials(materials);

    const rows =
        normalized.map(toDbMaterial);

    if (!rows.length) {
        DB.materials = normalized;
        return true;
    }

    const { error } =
        await supabaseClient
            .from("materials")
            .upsert(rows, {
                onConflict: "id"
            });

    if (error) {
        console.error(
            "Supabase material save error:",
            error
        );

        return false;
    }

    DB.materials = normalized;
    return true;
}

function getMaterials() {
    return normalizeMaterials(
        DB.materials
    );
}

function toDbTransaction(t) {
    return {
        id: t.id,
        material_id: t.materialId || null,
        lab: t.lab || null,
        type: t.type || null,
        date: t.date || null,
        time: t.time || null,
        teacher: t.teacher || null,
        quantity: Number(t.quantity || 0),
        status: t.status || null,
        remarks: t.remarks || null,
        expected_return_date: t.expectedReturnDate || null,
        actual_return_date: t.actualReturnDate || null,
        issued_to: t.issuedTo || null,
        created_at:
            t.createdAt ||
            new Date().toISOString()
    };
}

function fromDbTransaction(t) {
    return {
        id: t.id,
        materialId: t.material_id,
        lab: t.lab,
        type: t.type,
        date: t.date,
        time: t.time,
        teacher: t.teacher,
        quantity: Number(t.quantity || 0),
        status: t.status,
        remarks: t.remarks,
        expectedReturnDate: t.expected_return_date,
        actualReturnDate: t.actual_return_date,
        issuedTo: t.issued_to,
        createdAt: t.created_at
    };
}

function getTransactions() {
    return DB.transactions.slice();
}

async function saveTransactions(items) {
    const normalized =
        items.slice();

    if (!normalized.length) {
        DB.transactions = [];
        return true;
    }

    const rows =
        normalized.map(
            toDbTransaction
        );

    const { error } =
        await supabaseClient
            .from("transactions")
            .upsert(rows, {
                onConflict: "id"
            });

    if (error) {
        console.error(
            "Supabase transaction save error:",
            error
        );

        return false;
    }

    DB.transactions = normalized;
    return true;
}

function toDbOrder(o) {
    return {
        id: o.id,
        material_id: o.materialId,
        quantity: Number(o.quantity || 0),
        order_date: o.orderDate,
        status: o.status,
        received_qty: Number(o.receivedQty || 0),
        received_date: o.receivedDate || null,
        created_at:
            o.createdAt ||
            new Date().toISOString()
    };
}

function fromDbOrder(o) {
    return {
        id: o.id,
        materialId: o.material_id,
        quantity: Number(o.quantity || 0),
        orderDate: o.order_date,
        status: o.status,
        receivedQty: Number(o.received_qty || 0),
        receivedDate: o.received_date,
        createdAt: o.created_at
    };
}

function getOrders() {
    return DB.orders.slice();
}

async function saveOrders(items) {
    const normalized =
        items.slice();

    if (!normalized.length) {
        DB.orders = [];
        return true;
    }

    const rows =
        normalized.map(
            toDbOrder
        );

    const { error } =
        await supabaseClient
            .from("orders")
            .upsert(rows, {
                onConflict: "id"
            });

    if (error) {
        console.error(
            "Supabase order save error:",
            error
        );

        return false;
    }

    DB.orders = normalized;
    return true;
}

function generateId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function todayISO() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function timeNow() {
    const date = new Date();
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function addDays(dateString, days) {
    const date =
        new Date(`${dateString}T00:00:00`);

    date.setDate(
        date.getDate() + days
    );

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function formatDate(value) {
    if (!value) return "—";

    const date =
        new Date(`${value}T00:00:00`);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleDateString(
        "en-IN",
        {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }
    );
}

function number(value) {
    const n = Number(value);

    if (!Number.isFinite(n)) return "0";

    return Number.isInteger(n)
        ? String(n)
        : n
            .toFixed(2)
            .replace(/0+$/, "")
            .replace(/\.$/, "");
}

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function labName(lab) {
    return lab
        ? lab.charAt(0).toUpperCase() + lab.slice(1)
        : "—";
}

function typeName(type) {
    return type === "consumable"
        ? "Consumable / Perishable"
        : "Reusable";
}

function stockValue(material) {
    return material.type === "reusable"
        ? Number(material.availableQuantity || 0)
        : Number(material.quantity || 0);
}

function isLowStock(material) {
    if (!material || material.status === "deleted") {
        return false;
    }

    // The requirement is to alert when stock goes BELOW minimum.
    return (
        stockValue(material) <
        Number(material.minimumStock || 0)
    );
}

function daysUntil(dateString) {
    if (!dateString) return null;

    const [year, month, day] =
        String(dateString).split("-").map(Number);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const target = new Date(
        year,
        month - 1,
        day
    );

    target.setHours(0, 0, 0, 0);

    return Math.ceil(
        (target - today) /
        86400000
    );
}

/* ============================================================
   NAVIGATION
   ============================================================ */

function openLab(labNameValue) {
    if (!APP.labs.includes(labNameValue)) return;
    window.location.href = `inventory.html?lab=${encodeURIComponent(labNameValue)}`;
}

/* ============================================================
   PAGE INITIALIZATION
   ============================================================ */

function initializePage() {
    const page = location.pathname.split("/").pop();
    setActiveNavigation(page);

    if (page === "dashboard.html") initDashboard();
    if (page === "inventory.html") initInventory();
    if (page === "material.html") initMaterial();
    if (page === "reports.html") initReports();
    if (page === "orders.html") initOrders();
    if (page === "notifications.html") initNotifications();
}

function setActiveNavigation(page) {
    const links = document.querySelectorAll(".sidebar-nav a");
    if (!links.length) return;

    const lab = new URLSearchParams(location.search).get("lab");

    links.forEach(link => {
        link.classList.remove("active");
        const href = link.getAttribute("href") || "";

        let active = false;
        if (page === "dashboard.html" && href === "dashboard.html") active = true;
        if (page === "reports.html" && href === "reports.html") active = true;
        if (page === "orders.html" && href === "orders.html") active = true;
        if (page === "notifications.html" && href === "notifications.html") active = true;
        if ((page === "inventory.html" || page === "material.html") && lab && href === `inventory.html?lab=${lab}`) active = true;

        if (active) link.classList.add("active");
    });
}

/* ============================================================
   DASHBOARD
   ============================================================ */

function initDashboard() {
    const materials = getMaterials();

    setText("totalMaterials", materials.length);
    setText("lowStockMaterials", materials.filter(isLowStock).length);
    setText("reusableMaterials", materials.filter(m => m.type === "reusable").length);
    setText("consumableMaterials", materials.filter(m => m.type === "consumable").length);

    const allNotifications = buildNotifications();

    const alertBar = document.getElementById("dashboardAlertBar");
    const alertCount = document.getElementById("dashboardAlertCount");
    const alertText = document.getElementById("dashboardAlertText");
    const alertIcon = document.getElementById("dashboardAlertIcon");

    if (alertCount && alertText) {
        const count = allNotifications.length;
        alertCount.textContent = count
            ? `${count} important alert${count === 1 ? "" : "s"} need attention`
            : "Everything looks clear";
        alertText.textContent = count
            ? "Open Notifications to review stock, expiry, orders and equipment alerts."
            : "There are no active inventory alerts right now.";

        if (!count) {
            alertBar?.classList.add("is-clear");
            if (alertIcon) alertIcon.textContent = "✓";
        } else {
            alertBar?.classList.remove("is-clear");
            if (alertIcon) alertIcon.textContent = "🔔";
        }
    }

    const container = document.getElementById("dashboardNotifications");
    if (container) {
        const notifications = allNotifications.slice(0, 5);
        container.innerHTML = notifications.length
            ? notifications.map(notificationHTML).join("")
            : emptyNotificationHTML();
    }
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

/* ============================================================
   INVENTORY PAGE
   ============================================================ */

function initInventory() {
    const params = new URLSearchParams(location.search);
    const lab = params.get("lab");

    if (!APP.labs.includes(lab)) {
        document.getElementById("labTitle").textContent = "Select a Laboratory";
        renderInventory([]);
        return;
    }

    document.title = `${labName(lab)} Inventory - Lab Inventory`;
    document.getElementById("labTitle").textContent = `${labName(lab)} Laboratory`;

    const labSelect = document.getElementById("newMaterialLab");
    if (labSelect) labSelect.value = lab;

    const search = document.getElementById("inventorySearch");
    const typeFilter = document.getElementById("inventoryTypeFilter");

    if (search) search.addEventListener("input", renderCurrentInventory);
    if (typeFilter) typeFilter.addEventListener("change", renderCurrentInventory);

    const form = document.getElementById("addMaterialForm");
    if (form) form.addEventListener("submit", saveMaterialFromForm);

    const type = document.getElementById("newMaterialType");
    if (type) type.addEventListener("change", updateExpiryVisibility);

    const indefiniteExpiry = document.getElementById("newMaterialExpiryIndefinite");
    if (indefiniteExpiry) indefiniteExpiry.addEventListener("change", updateExpiryVisibility);

    updateExpiryVisibility();
    renderCurrentInventory();

    const editId =
        new URLSearchParams(location.search).get("edit");

    if (editId) {
        openAddMaterialForm(editId);
    }
}

function renderCurrentInventory() {
    const params = new URLSearchParams(location.search);
    const lab = params.get("lab");
    const search = (document.getElementById("inventorySearch")?.value || "").trim().toLowerCase();
    const type = document.getElementById("inventoryTypeFilter")?.value || "all";

    let materials = getMaterials().filter(m => m.lab === lab && m.status !== "deleted");

    if (type !== "all") {
        materials = materials.filter(m => m.type === type);
    }

    if (search) {
        materials = materials.filter(m =>
            [m.name, m.category, m.unit, m.id].some(v => String(v || "").toLowerCase().includes(search))
        );
    }

    renderInventory(materials);
}

function renderInventory(materials) {
    const container = document.getElementById("inventoryContainer");
    if (!container) return;

    if (!materials.length) {
        container.innerHTML = `<div class="empty-state full-width"><div class="empty-state-icon">📦</div><h3>No materials found</h3><p>Try another search or add a new material.</p></div>`;
        return;
    }

    container.innerHTML = materials.map(materialCardHTML).join("");
}

function materialCardHTML(m) {
    const stock = stockValue(m);
    const low = isLowStock(m);
    const expiry = m.type === "consumable" ? expiryStatus(m.expiryDate) : null;

    return `
        <article class="material-card">
            <div class="material-card-top">
                <span class="type-badge">${escapeHTML(typeName(m.type))}</span>
                <span class="stock-badge ${low ? "stock-low" : "stock-ok"}">${low ? "Low Stock" : "In Stock"}</span>
            </div>
            <h3>${escapeHTML(m.name)}</h3>
            <p class="material-category">${escapeHTML(m.category)}</p>
            <div class="material-card-stats">
                <div><span>Available</span><strong>${number(stock)} ${escapeHTML(m.unit)}</strong></div>
                <div><span>Minimum</span><strong>${number(m.minimumStock)} ${escapeHTML(m.unit)}</strong></div>
            </div>
            ${m.type === "reusable" ? `<p class="small-muted">Total: ${number(m.totalQuantity)} · Issued: ${number(m.issuedQuantity)} · Damaged: ${number(m.damagedQuantity)}</p>` : `<p class="expiry-line ${expiry?.class || ""}">Expiry: ${escapeHTML(expiryDisplay(m.expiryDate))}${expiry?.label ? ` · ${expiry.label}` : ""}</p>`}
            <a class="card-action" href="material.html?id=${encodeURIComponent(m.id)}">View Details →</a>
        </article>
    `;
}

function expiryDisplay(date) {
    return date ? formatDate(date) : "Indefinite";
}

function normalizeExpiryValue(value, indefinite = false) {
    if (indefinite) return null;
    const cleaned = String(value || "").trim();
    return cleaned || null;
}

function compareExpiry(a, b) {
    const aExpiry = a?.expiryDate || null;
    const bExpiry = b?.expiryDate || null;
    if (!aExpiry && !bExpiry) return 0;
    if (!aExpiry) return 1;
    if (!bExpiry) return -1;
    return String(aExpiry).localeCompare(String(bExpiry));
}

function expiryStatus(date) {
    if (!date) return {class:"expiry-ok", label:"Indefinite expiry"};
    const days = daysUntil(date);
    if (days < 0) return {class:"expiry-danger", label:"Expired"};
    if (days <= 30) return {class:"expiry-warning", label:`${days} day${days === 1 ? "" : "s"} left`};
    return {class:"expiry-ok", label:"Valid"};
}

/* ============================================================
   ADD / EDIT / DELETE MATERIAL
   ============================================================ */

function openAddMaterialForm(materialId = null) {
    const modal = document.getElementById("addMaterialModal");
    if (!modal) return;

    const form = document.getElementById("addMaterialForm");
    form.reset();

    document.getElementById("editingMaterialId").value = materialId || "";
    document.getElementById("materialFormTitle").textContent = materialId ? "Edit Material" : "Add New Material";

    const params = new URLSearchParams(location.search);
    document.getElementById("newMaterialLab").value = params.get("lab") || "physics";

    if (materialId) {
        const m = getMaterials().find(x => x.id === materialId);
        if (!m) return;

        document.getElementById("newMaterialLab").value = m.lab;
        document.getElementById("newMaterialName").value = m.name;
        document.getElementById("newMaterialCategory").value = m.category;
        document.getElementById("newMaterialType").value = m.type;
        document.getElementById("newMaterialUnit").value = m.unit;
        document.getElementById("newMaterialQuantity").value = stockValue(m);
        document.getElementById("newMaterialMinimum").value = m.minimumStock;
        document.getElementById("newMaterialExpiry").value = m.expiryDate || "";
        const indefinite = document.getElementById("newMaterialExpiryIndefinite");
        if (indefinite) indefinite.checked = !m.expiryDate;
    }

    updateExpiryVisibility();
    clearError("materialFormError");
    modal.classList.remove("hidden");
}

function closeAddMaterialForm() {
    document.getElementById("addMaterialModal")?.classList.add("hidden");
}

function updateExpiryVisibility() {
    const type = document.getElementById("newMaterialType")?.value;
    const group = document.getElementById("newExpiryGroup");
    const input = document.getElementById("newMaterialExpiry");

    if (!group || !input) return;

    const show = type === "consumable";
    const indefinite = document.getElementById("newMaterialExpiryIndefinite");
    group.classList.toggle("hidden", !show);
    input.required = show && !(indefinite?.checked);
    input.disabled = !show || !!indefinite?.checked;
    if (indefinite?.checked) input.value = "";
}

async function saveMaterialFromForm(event) {
    event.preventDefault();

    const idBeingEdited =
        document.getElementById("editingMaterialId")?.value || "";

    const lab =
        document.getElementById("newMaterialLab")?.value || "";

    const type =
        document.getElementById("newMaterialType")?.value || "";

    const name =
        document.getElementById("newMaterialName")?.value.trim() || "";

    const category =
        document.getElementById("newMaterialCategory")?.value.trim() || "";

    const unit =
        document.getElementById("newMaterialUnit")?.value.trim() || "";

    const quantity =
        Number(document.getElementById("newMaterialQuantity")?.value);

    const minimum =
        Number(document.getElementById("newMaterialMinimum")?.value);

    const expiry = normalizeExpiryValue(
        document.getElementById("newMaterialExpiry")?.value,
        document.getElementById("newMaterialExpiryIndefinite")?.checked
    );

    const error =
        document.getElementById("materialFormError");

    if (!APP.labs.includes(lab)) {
        return showError(error, "Please select a valid laboratory.");
    }

    if (!["reusable", "consumable"].includes(type)) {
        return showError(error, "Please select a valid material type.");
    }

    if (!name || !category || !unit) {
        return showError(
            error,
            "Material name, category and unit are required."
        );
    }

    if (!Number.isFinite(quantity) || quantity < 0) {
        return showError(
            error,
            "Quantity must be a valid number of 0 or more."
        );
    }

    if (!Number.isFinite(minimum) || minimum < 0) {
        return showError(
            error,
            "Minimum stock must be a valid number of 0 or more."
        );
    }

    // Physics and Biology are reusable-only by requirement.
    if (
        type === "consumable" &&
        lab !== "chemistry"
    ) {
        return showError(
            error,
            "Consumable / perishable materials can only be added to the Chemistry Laboratory."
        );
    }

    // Chemistry consumables may have a normal expiry date OR explicitly be marked indefinite.
    const expiryIndefinite = !!document.getElementById("newMaterialExpiryIndefinite")?.checked;
    if (type === "consumable" && expiry === null && !expiryIndefinite) {
        return showError(
            error,
            "Choose an expiry date or select No expiry / Indefinite expiry."
        );
    }

    const materials = getMaterials();

    if (idBeingEdited) {
        const m =
            materials.find(
                x => x.id === idBeingEdited
            );

        if (!m) {
            return showError(
                error,
                "The material could not be found."
            );
        }

        // Do not silently change the type of an item that already has
        // stock history/issued quantities.
        if (m.type !== type) {
            if (
                Number(m.issuedQuantity || 0) > 0 ||
                Number(m.damagedQuantity || 0) > 0
            ) {
                return showError(
                    error,
                    "Material type cannot be changed while this item has issued or damaged quantities."
                );
            }
        }

        const oldStock =
            stockValue(m);

        const newStock =
            quantity;

        m.name = name;
        m.category = category;
        m.lab = lab;
        m.type = type;
        m.unit = unit;
        m.minimumStock = minimum;

        if (type === "reusable") {
            m.expiryDate = null;
            m.batches = [];

            const issued =
                Number(m.issuedQuantity || 0);

            const damaged =
                Number(m.damagedQuantity || 0);

            if (newStock < 0) {
                return showError(
                    error,
                    "Quantity cannot be negative."
                );
            }

            m.availableQuantity =
                newStock;

            m.totalQuantity =
                newStock +
                issued +
                damaged;

            m.quantity =
                m.availableQuantity;
        } else {
            m.quantity =
                newStock;

            m.availableQuantity =
                newStock;

            m.totalQuantity =
                newStock;

            m.expiryDate =
                expiry;

            m.batches =
                Array.isArray(m.batches)
                    ? m.batches
                    : [];

            if (!m.batches.length && newStock > 0) {
                m.batches.push({
                    batchId: `${m.id}-B01`,
                    dateAdded: todayISO(),
                    quantityAdded: newStock,
                    quantityRemaining: newStock,
                    expiryDate: expiry
                });
            } else if (m.batches.length === 1) {
                // Simple single-batch editing remains intuitive.
                m.batches[0].expiryDate = expiry;
            }
        }

        const saved =
            await saveMaterials(materials);

        if (!saved) {
            return showError(
                error,
                "The material could not be saved to Supabase."
            );
        }

        if (oldStock !== newStock) {
            await addTransaction({
                type: "stock_adjustment",
                materialId: m.id,
                lab: m.lab,
                date: todayISO(),
                time: timeNow(),
                quantity: newStock - oldStock,
                teacher: "Lab Assistant",
                remarks: "Manual stock adjustment while editing material"
            });
        }
    } else {
        const prefix =
            lab === "physics"
                ? "PHY"
                : lab === "chemistry"
                    ? "CHE"
                    : "BIO";

        const newId =
            generateId(prefix);

        const m = {
            id: newId,
            name,
            lab,
            category,
            type,
            unit,
            quantity,
            totalQuantity: quantity,
            availableQuantity: quantity,
            issuedQuantity: 0,
            damagedQuantity: 0,
            minimumStock: minimum,
            expiryDate:
                type === "consumable"
                    ? expiry
                    : null,
            batches: [],
            status: "active"
        };

        if (type === "consumable") {
            m.batches = [{
                batchId: `${newId}-B01`,
                dateAdded: todayISO(),
                quantityAdded: quantity,
                quantityRemaining: quantity,
                expiryDate: expiry
            }];
        }

        materials.push(m);

        const saved =
            await saveMaterials(materials);

        if (!saved) {
            return showError(
                error,
                "The material could not be saved to Supabase."
            );
        }
    }

    closeAddMaterialForm();
    renderCurrentInventory();
    initDashboardIfVisible();
}

function editMaterial(id) {
    openAddMaterialForm(id);
}

async function deleteMaterial(id) {
    const materials = getMaterials();

    const m =
        materials.find(
            x => x.id === id
        );

    if (!m) return;

    const confirmed =
        confirm(
            `Permanently delete "${m.name}"? This will remove the material, its orders and its transaction history from the database.`
        );

    if (!confirmed) return;

    try {
        // Remove dependent records first because orders use ON DELETE RESTRICT.
        const { error: transactionError } =
            await supabaseClient
                .from("transactions")
                .delete()
                .eq("material_id", id);

        if (transactionError) {
            throw transactionError;
        }

        const { error: orderError } =
            await supabaseClient
                .from("orders")
                .delete()
                .eq("material_id", id);

        if (orderError) {
            throw orderError;
        }

        const { error: materialError } =
            await supabaseClient
                .from("materials")
                .delete()
                .eq("id", id);

        if (materialError) {
            throw materialError;
        }

        DB.materials =
            DB.materials.filter(
                material =>
                    material.id !== id
            );

        DB.transactions =
            DB.transactions.filter(
                transaction =>
                    transaction.materialId !== id
            );

        DB.orders =
            DB.orders.filter(
                order =>
                    order.materialId !== id
            );

        if (
            location.pathname.endsWith(
                "material.html"
            )
        ) {
            window.location.href =
                `inventory.html?lab=${m.lab}`;
        } else {
            renderCurrentInventory();
            initDashboardIfVisible();
        }

    } catch (error) {
        console.error(
            "Delete material error:",
            error
        );

        alert(
            "The material could not be completely deleted from Supabase."
        );
    }
}

function initDashboardIfVisible() {
    if (
        location.pathname.endsWith(
            "dashboard.html"
        )
    ) {
        initDashboard();
    }
}

/* ============================================================
   MATERIAL DETAIL
   ============================================================ */

function initMaterial() {
    const id = new URLSearchParams(location.search).get("id");
    const material = getMaterials().find(m => m.id === id && m.status !== "deleted");

    if (!material) {
        document.getElementById("materialDetailsContainer").innerHTML =
            `<div class="empty-state"><h3>Material not found</h3><p>The requested material does not exist.</p><a class="card-action" href="dashboard.html">Return to Dashboard</a></div>`;
        return;
    }

    document.title = `${material.name} - Lab Inventory`;
    document.getElementById("materialPageTitle").textContent = material.name;
    document.getElementById("backToInventory").href = `inventory.html?lab=${material.lab}`;

    setupMaterialForms(material);
    renderMaterialDetails(material);
}

function renderMaterialDetails(material) {
    const container = document.getElementById("materialDetailsContainer");
    const stock = stockValue(material);
    const low = isLowStock(material);
    const transactions = getTransactions().filter(t => t.materialId === material.id).slice(-8).reverse();

    let actionButtons = "";

    if (material.type === "reusable") {
        actionButtons = `
            <button class="primary-button" onclick="openIssueModal()">Issue / Usage</button>
            <button class="secondary-button" onclick="openReturnModal()">Return Equipment</button>
            <button class="danger-button" onclick="openDamageModal()">Damage Report</button>
        `;
    } else {
        actionButtons = `
            <button class="primary-button" onclick="openUsageModal()">Usage Report</button>
            <button class="secondary-button" onclick="openAddStockModal()">Add Quantity</button>
            <button class="secondary-button" onclick="openOrderForMaterial()">Create Order</button>
            <button class="danger-button" onclick="openDamageModal()">Damage Report</button>
        `;
    }

    const batchHTML = material.type === "consumable" && material.batches?.length
        ? `<div class="panel mt-20"><div class="section-heading"><p>Stock Batches</p><h2>Expiry Tracking</h2></div><div class="table-container"><table><thead><tr><th>Batch</th><th>Added</th><th>Remaining</th><th>Expiry</th></tr></thead><tbody>${material.batches.filter(b => Number(b.quantityRemaining) > 0).map(b => `<tr><td>${escapeHTML(b.batchId)}</td><td>${formatDate(b.dateAdded)}</td><td>${number(b.quantityRemaining)} ${escapeHTML(material.unit)}</td><td>${escapeHTML(expiryDisplay(b.expiryDate))}</td></tr>`).join("") || `<tr><td colspan="4">No active batches.</td></tr>`}</tbody></table></div></div>`
        : "";

    container.innerHTML = `
        <section class="material-details-card">
            <div class="detail-header">
                <div>
                    <span class="type-badge">${escapeHTML(typeName(material.type))}</span>
                    <h2>${escapeHTML(material.name)}</h2>
                    <p>${escapeHTML(material.category)} · ${escapeHTML(labName(material.lab))}</p>
                </div>
                <div class="detail-header-actions">
                    <button class="secondary-button" onclick="editMaterialFromDetails()">Edit</button>
                    <button class="danger-outline-button" onclick="deleteMaterial('${escapeHTML(material.id)}')">Delete</button>
                </div>
            </div>

            <div class="details-grid">
                <div class="detail-item"><span>Material ID</span><strong>${escapeHTML(material.id)}</strong></div>
                <div class="detail-item"><span>Unit</span><strong>${escapeHTML(material.unit)}</strong></div>
                <div class="detail-item"><span>Available</span><strong>${number(stock)} ${escapeHTML(material.unit)}</strong></div>
                <div class="detail-item"><span>Minimum Stock</span><strong>${number(material.minimumStock)} ${escapeHTML(material.unit)}</strong></div>
                <div class="detail-item"><span>Stock Status</span><strong class="${low ? "text-danger" : "text-success"}">${low ? "Low Stock" : "Healthy"}</strong></div>
                ${material.type === "reusable" ? `
                    <div class="detail-item"><span>Total Quantity</span><strong>${number(material.totalQuantity)} ${escapeHTML(material.unit)}</strong></div>
                    <div class="detail-item"><span>Currently Issued</span><strong>${number(material.issuedQuantity)} ${escapeHTML(material.unit)}</strong></div>
                    <div class="detail-item"><span>Damaged</span><strong>${number(material.damagedQuantity)} ${escapeHTML(material.unit)}</strong></div>
                ` : `
                    <div class="detail-item"><span>Expiry</span><strong>${escapeHTML(expiryDisplay(material.expiryDate))}</strong></div>
                `}
            </div>

            <div class="material-actions">${actionButtons}</div>
        </section>

        ${batchHTML}

        <section class="panel mt-20">
            <div class="section-heading"><p>History</p><h2>Recent Activity</h2></div>
            <div class="table-container"><table><thead><tr><th>Date</th><th>Activity</th><th>Qty</th><th>Teacher</th><th>Status</th><th>Remarks</th></tr></thead><tbody>
                ${transactions.length ? transactions.map(t => `<tr><td>${formatDate(t.date)} ${escapeHTML(t.time || "")}</td><td>${escapeHTML(activityLabel(t.type))}</td><td>${t.quantity != null ? number(t.quantity) : "—"}</td><td>${escapeHTML(t.teacher || "—")}</td><td>${escapeHTML(t.status || "Completed")}</td><td>${escapeHTML(t.remarks || "—")}</td></tr>`).join("") : `<tr><td colspan="6">No activity recorded yet.</td></tr>`}
            </tbody></table></div>
        </section>
    `;
}

function currentMaterial() {
    const id = new URLSearchParams(location.search).get("id");
    return getMaterials().find(m => m.id === id && m.status !== "deleted");
}

function editMaterialFromDetails() {
    const m = currentMaterial();
    if (!m) return;
    // Reuse the inventory form by sending the user to inventory with edit mode.
    window.location.href = `inventory.html?lab=${m.lab}&edit=${encodeURIComponent(m.id)}`;
}

/* ============================================================
   MATERIAL MODALS
   ============================================================ */

function setupMaterialForms(material) {
    const dateFields = [
        "issueDate",
        "returnDate",
        "usageDate",
        "stockAddDate",
        "damageDate"
    ];

    dateFields.forEach(id => {
        const el =
            document.getElementById(id);

        if (el) {
            el.value =
                el.value ||
                todayISO();
        }
    });

    const timeFields = [
        "issueTime",
        "returnTime",
        "damageTime"
    ];

    timeFields.forEach(id => {
        const el =
            document.getElementById(id);

        if (el) {
            el.value =
                el.value ||
                timeNow();
        }
    });

    const expected =
        document.getElementById(
            "expectedReturnDate"
        );

    if (expected && !expected.value) {
        expected.value =
            addDays(
                todayISO(),
                3
            );
    }

    // Assign handlers rather than addEventListener so repeated
    // calls to initMaterial() never create duplicate submissions.
    const issueForm =
        document.getElementById("issueForm");
    const returnForm =
        document.getElementById("returnForm");
    const damageForm =
        document.getElementById("damageForm");
    const usageForm =
        document.getElementById("usageForm");
    const addStockForm =
        document.getElementById("addStockForm");

    if (issueForm) issueForm.onsubmit = submitIssue;
    if (returnForm) returnForm.onsubmit = submitReturn;
    if (damageForm) damageForm.onsubmit = submitDamage;
    if (usageForm) usageForm.onsubmit = submitUsage;
    if (addStockForm) addStockForm.onsubmit = submitAddStock;

    const stockExpiryIndefinite = document.getElementById("stockExpiryIndefinite");
    const stockExpiry = document.getElementById("stockExpiry");
    if (stockExpiryIndefinite && stockExpiry) {
        stockExpiryIndefinite.onchange = () => {
            stockExpiry.disabled = stockExpiryIndefinite.checked;
            stockExpiry.required = !stockExpiryIndefinite.checked;
            if (stockExpiryIndefinite.checked) stockExpiry.value = "";
        };
    }
}

function openModal(id) {
    document
        .getElementById(id)
        ?.classList.remove("hidden");
}

function closeModal(id) {
    document
        .getElementById(id)
        ?.classList.add("hidden");
}

function openIssueModal() {
    clearError("issueError");
    openModal("issueModal");
}

function openReturnModal() {
    clearError("returnError");
    openModal("returnModal");
}

function openDamageModal() {
    clearError("damageError");
    openModal("damageModal");
}

function openUsageModal() {
    clearError("usageError");
    openModal("usageModal");
}

function openAddStockModal() {
    clearError("stockAddError");
    const checkbox = document.getElementById("stockExpiryIndefinite");
    const input = document.getElementById("stockExpiry");
    if (checkbox) checkbox.checked = false;
    if (input) {
        input.value = "";
        input.disabled = false;
        input.required = true;
    }
    openModal("addStockModal");
}

async function submitIssue(event) {
    event.preventDefault();

    const m = currentMaterial();
    if (!m) return;

    const qty =
        Number(
            document.getElementById(
                "issueQuantity"
            ).value
        );

    const teacher =
        document.getElementById(
            "issueTeacher"
        ).value.trim();

    const available =
        stockValue(m);

    if (!Number.isInteger(qty) || qty <= 0) {
        return showError(
            document.getElementById("issueError"),
            "Reusable equipment quantity must be a whole number greater than 0."
        );
    }

    if (qty > available) {
        return showError(
            document.getElementById("issueError"),
            `Only ${number(available)} ${m.unit} are available.`
        );
    }

    if (!teacher) {
        return showError(
            document.getElementById("issueError"),
            "Teacher name is required."
        );
    }

    const materials =
        getMaterials();

    const target =
        materials.find(
            x => x.id === m.id
        );

    target.availableQuantity -= qty;
    target.issuedQuantity += qty;
    target.quantity =
        target.availableQuantity;

    const saved =
        await saveMaterials(materials);

    if (!saved) {
        return showError(
            document.getElementById("issueError"),
            "The equipment issue could not be saved to Supabase."
        );
    }

    const transactionSaved =
        await addTransaction({
            type: "issue",
            materialId: m.id,
            lab: m.lab,
            date: document.getElementById("issueDate").value,
            time: document.getElementById("issueTime").value,
            teacher,
            quantity: qty,
            expectedReturnDate: document.getElementById("expectedReturnDate").value,
            status: "Not Returned",
            remarks: document.getElementById("issueRemarks").value.trim()
        });

    if (!transactionSaved) {
        alert(
            "The equipment stock was updated, but the usage record could not be saved."
        );
    }

    closeModal("issueModal");
    initMaterial();
}

async function submitReturn(event) {
    event.preventDefault();

    const m = currentMaterial();
    if (!m) return;

    const qty =
        Number(
            document.getElementById(
                "returnQuantity"
            ).value
        );

    const teacher =
        document.getElementById(
            "returnTeacher"
        ).value.trim();

    const issued =
        Number(m.issuedQuantity || 0);

    if (!Number.isInteger(qty) || qty <= 0) {
        return showError(
            document.getElementById("returnError"),
            "Return quantity must be a whole number greater than 0."
        );
    }

    if (qty > issued) {
        return showError(
            document.getElementById("returnError"),
            `Currently issued: ${number(issued)} ${m.unit}.`
        );
    }

    if (!teacher) {
        return showError(
            document.getElementById("returnError"),
            "Teacher name is required."
        );
    }

    const materials =
        getMaterials();

    const target =
        materials.find(
            x => x.id === m.id
        );

    target.availableQuantity += qty;
    target.issuedQuantity -= qty;
    target.quantity =
        target.availableQuantity;

    const saved =
        await saveMaterials(materials);

    if (!saved) {
        return showError(
            document.getElementById("returnError"),
            "The return could not be saved to Supabase."
        );
    }

    const returnDate =
        document.getElementById("returnDate").value;

    const transactions =
        getTransactions();

    let remaining = qty;

    // Keep the existing FIFO behavior for the outstanding issue records,
    // while preserving the fact that a return transaction was recorded.
    for (let i = 0; i < transactions.length && remaining > 0; i++) {
        const t = transactions[i];

        if (
            t.materialId === m.id &&
            t.type === "issue" &&
            t.status === "Not Returned"
        ) {
            const used =
                Math.min(
                    Number(t.quantity || 0),
                    remaining
                );

            t.quantity =
                Number(t.quantity || 0) - used;

            if (t.quantity <= 0) {
                t.quantity = 0;
                t.status = "Returned";
                t.actualReturnDate = returnDate;
            }

            remaining -= used;
        }
    }

    const issueRecordsSaved =
        await saveTransactions(transactions);

    if (!issueRecordsSaved) {
        alert(
            "The equipment stock was returned, but the issue history could not be updated."
        );
    }

    const transactionSaved =
        await addTransaction({
            type: "return",
            materialId: m.id,
            lab: m.lab,
            date: returnDate,
            time: document.getElementById("returnTime").value,
            teacher,
            quantity: qty,
            status: "Returned",
            remarks: document.getElementById("returnRemarks").value.trim()
        });

    if (!transactionSaved) {
        alert(
            "The return was recorded in the inventory count, but the return history could not be saved."
        );
    }

    closeModal("returnModal");
    initMaterial();
}

async function submitDamage(event) {
    event.preventDefault();

    const m = currentMaterial();
    if (!m) return;

    const qty =
        Number(
            document.getElementById(
                "damageQuantity"
            ).value
        );

    const available =
        stockValue(m);

    if (!Number.isFinite(qty) || qty <= 0) {
        return showError(
            document.getElementById("damageError"),
            "Enter a valid damage quantity greater than 0."
        );
    }

    if (qty > available) {
        return showError(
            document.getElementById("damageError"),
            `Only ${number(available)} ${m.unit} are currently available.`
        );
    }

    const materials =
        getMaterials();

    const target =
        materials.find(
            x => x.id === m.id
        );

    if (target.type === "reusable") {
        if (!Number.isInteger(qty)) {
            return showError(
                document.getElementById("damageError"),
                "Reusable equipment quantity must be a whole number."
            );
        }

        target.availableQuantity -= qty;
        target.totalQuantity -= qty;
        target.damagedQuantity += qty;
        target.quantity =
            target.availableQuantity;
    } else {
        target.quantity -= qty;
        target.availableQuantity =
            target.quantity;
        target.totalQuantity =
            target.quantity;
        target.damagedQuantity =
            Number(target.damagedQuantity || 0) + qty;
        reduceBatches(
            target,
            qty
        );
    }

    const saved =
        await saveMaterials(materials);

    if (!saved) {
        return showError(
            document.getElementById("damageError"),
            "The damage report could not be saved to Supabase."
        );
    }

    const transactionSaved =
        await addTransaction({
            type: "damage",
            materialId: m.id,
            lab: m.lab,
            date: document.getElementById("damageDate").value,
            time: document.getElementById("damageTime").value,
            teacher: document.getElementById("damageTeacher").value.trim(),
            quantity: qty,
            status: "Damaged",
            remarks: document.getElementById("damageRemarks").value.trim()
        });

    if (!transactionSaved) {
        alert(
            "The damaged stock was updated, but the damage history could not be saved."
        );
    }

    closeModal("damageModal");
    initMaterial();
}

async function submitUsage(event) {
    event.preventDefault();

    const m = currentMaterial();
    if (!m) return;

    const qty =
        Number(
            document.getElementById(
                "usageQuantity"
            ).value
        );

    const available =
        stockValue(m);

    if (!Number.isFinite(qty) || qty <= 0) {
        return showError(
            document.getElementById("usageError"),
            "Enter a valid usage quantity greater than 0."
        );
    }

    if (qty > available) {
        return showError(
            document.getElementById("usageError"),
            `Available: ${number(available)} ${m.unit}.`
        );
    }

    const materials =
        getMaterials();

    const target =
        materials.find(
            x => x.id === m.id
        );

    target.quantity -= qty;
    target.availableQuantity =
        target.quantity;
    target.totalQuantity =
        target.quantity;

    reduceBatches(
        target,
        qty
    );

    const saved =
        await saveMaterials(materials);

    if (!saved) {
        return showError(
            document.getElementById("usageError"),
            "The usage could not be saved to Supabase."
        );
    }

    const transactionSaved =
        await addTransaction({
            type: "usage",
            materialId: m.id,
            lab: m.lab,
            date: document.getElementById("usageDate").value,
            time: timeNow(),
            teacher: document.getElementById("usageTeacher").value.trim(),
            quantity: qty,
            status: "Used",
            remarks: document.getElementById("usageRemarks").value.trim()
        });

    if (!transactionSaved) {
        alert(
            "The stock was reduced, but the usage history could not be saved."
        );
    }

    closeModal("usageModal");
    initMaterial();
}

async function submitAddStock(event) {
    event.preventDefault();

    const m = currentMaterial();
    if (!m) return;

    const qty =
        Number(
            document.getElementById(
                "stockAddQuantity"
            ).value
        );

    const expiry = normalizeExpiryValue(
        document.getElementById("stockExpiry").value,
        document.getElementById("stockExpiryIndefinite")?.checked
    );

    if (!Number.isFinite(qty) || qty <= 0) {
        return showError(
            document.getElementById("stockAddError"),
            "Enter a positive quantity."
        );
    }

    const materials =
        getMaterials();

    const target =
        materials.find(
            x => x.id === m.id
        );

    target.quantity += qty;
    target.availableQuantity =
        target.quantity;
    target.totalQuantity =
        target.quantity;
    target.batches =
        Array.isArray(target.batches)
            ? target.batches
            : [];

    target.batches.push({
        batchId:
            `${target.id}-B${String(
                target.batches.length + 1
            ).padStart(2, "0")}`,

        dateAdded:
            document.getElementById(
                "stockAddDate"
            ).value || todayISO(),

        quantityAdded:
            qty,

        quantityRemaining:
            qty,

        expiryDate:
            expiry
    });

    target.batches.sort(compareExpiry);

    target.expiryDate =
        target.batches[0]?.expiryDate ||
        expiry;

    const saved =
        await saveMaterials(materials);

    if (!saved) {
        return showError(
            document.getElementById("stockAddError"),
            "The stock could not be added to Supabase."
        );
    }

    const transactionSaved =
        await addTransaction({
            type: "add_stock",
            materialId: m.id,
            lab: m.lab,
            date: document.getElementById("stockAddDate").value || todayISO(),
            time: timeNow(),
            teacher: "Lab Assistant",
            quantity: qty,
            status: "Added",
            remarks: document.getElementById("stockRemarks").value.trim()
        });

    if (!transactionSaved) {
        alert(
            "The stock was added, but the stock-addition history could not be saved."
        );
    }

    closeModal("addStockModal");
    initMaterial();
}

function reduceBatches(material, quantity) {
    if (!Array.isArray(material.batches)) {
        material.batches = [];
    }

    let remaining =
        Number(quantity || 0);

    material.batches.sort(
        (a, b) =>
            String(a.expiryDate || "9999-12-31")
                .localeCompare(
                    String(b.expiryDate || "9999-12-31")
                )
    );

    for (const batch of material.batches) {
        if (remaining <= 0) break;

        const batchRemaining =
            Number(
                batch.quantityRemaining || 0
            );

        const take =
            Math.min(
                batchRemaining,
                remaining
            );

        batch.quantityRemaining =
            batchRemaining - take;

        remaining -= take;
    }

    material.batches =
        material.batches.filter(
            b =>
                Number(
                    b.quantityRemaining
                ) > 0
        );

    material.expiryDate =
        material.batches[0]
            ?.expiryDate ||
        null;
}

/* ============================================================
   TRANSACTIONS
   ============================================================ */

async function addTransaction(transaction) {
    const transactions =
        getTransactions();

    transactions.push({
        id: generateId("TX"),
        createdAt: new Date().toISOString(),
        ...transaction
    });

    return await saveTransactions(
        transactions
    );
}

function activityLabel(type) {
    const labels = {
        usage: "Consumable Used",
        issue: "Equipment Issued",
        return: "Equipment Returned",
        damage: "Damage Report",
        add_stock: "Stock Added",
        stock_adjustment: "Stock Adjusted"
    };
    return labels[type] || type;
}

/* ============================================================
   ORDERS
   ============================================================ */

function initOrders() {
    const date =
        document.getElementById(
            "orderDate"
        );

    if (date && !date.value) {
        date.value =
            todayISO();
    }

    populateOrderMaterials();

    const requestedMaterial =
        new URLSearchParams(
            location.search
        ).get("material");

    if (requestedMaterial) {
        const select =
            document.getElementById(
                "orderMaterial"
            );

        if (select) {
            select.value =
                requestedMaterial;
        }
    }

    renderOrders();
}

function populateOrderMaterials() {
    const select =
        document.getElementById(
            "orderMaterial"
        );

    if (!select) return;

    const consumables =
        getMaterials().filter(
            m =>
                m.type === "consumable" &&
                m.status !== "deleted"
        );

    select.innerHTML =
        consumables.length
            ? consumables
                .map(
                    m =>
                        `<option value="${escapeHTML(m.id)}">${escapeHTML(m.name)} (${escapeHTML(labName(m.lab))})</option>`
                )
                .join("")
            : `<option value="">No consumable materials</option>`;
}

async function createOrder() {
    const materialId =
        document.getElementById(
            "orderMaterial"
        )?.value;

    const quantity =
        Number(
            document.getElementById(
                "orderQuantity"
            )?.value
        );

    const date =
        document.getElementById(
            "orderDate"
        )?.value ||
        todayISO();

    const error =
        document.getElementById(
            "orderFormError"
        );

    if (!materialId || !Number.isFinite(quantity) || quantity <= 0) {
        return showError(
            error,
            "Select a material and enter a positive quantity."
        );
    }

    const material =
        getMaterials().find(
            m => m.id === materialId
        );

    if (!material) {
        return showError(
            error,
            "Material not found."
        );
    }

    if (material.type !== "consumable") {
        return showError(
            error,
            "Orders can only be created for consumable / perishable materials."
        );
    }

    const orders =
        getOrders();

    orders.push({
        id: generateId("ORD"),
        materialId,
        quantity,
        orderDate: date,
        status: "To be ordered",
        receivedQty: 0,
        receivedDate: null
    });

    const saved =
        await saveOrders(orders);

    if (!saved) {
        return showError(
            error,
            "The order could not be saved to Supabase."
        );
    }

    const quantityInput =
        document.getElementById(
            "orderQuantity"
        );

    if (quantityInput) {
        quantityInput.value = "";
    }

    clearError(error);
    renderOrders();
}

function renderOrders() {
    const body =
        document.getElementById(
            "ordersTableBody"
        );

    if (!body) return;

    const materials =
        getMaterials();

    const orders =
        getOrders()
            .slice()
            .reverse();

    body.innerHTML =
        orders.length
            ? orders
                .map(order => {
                    const material =
                        materials.find(
                            m =>
                                m.id ===
                                order.materialId
                        );

                    const statusClass =
                        String(order.status || "")
                            .toLowerCase()
                            .replaceAll(" ", "-");

                    return `
                        <tr>
                            <td>${escapeHTML(order.id)}</td>
                            <td>${escapeHTML(material?.name || "Deleted material")}</td>
                            <td>${number(order.quantity)} ${escapeHTML(material?.unit || "")}</td>
                            <td>${formatDate(order.orderDate)}</td>
                            <td>
                                <span class="order-status status-${statusClass}">
                                    ${escapeHTML(order.status)}
                                </span>
                            </td>
                            <td>${order.receivedDate ? formatDate(order.receivedDate) : "—"}</td>
                            <td>
                                ${
                                    order.status !== "Received"
                                        ? `
                                            <select
                                                class="status-select"
                                                onchange="changeOrderStatus('${escapeHTML(order.id)}', this.value)"
                                            >
                                                <option ${order.status === "To be ordered" ? "selected" : ""}>To be ordered</option>
                                                <option ${order.status === "Ordered" ? "selected" : ""}>Ordered</option>
                                                <option ${order.status === "Received" ? "selected" : ""}>Received</option>
                                            </select>
                                        `
                                        : `<span class="text-success">Completed</span>`
                                }
                            </td>
                        </tr>
                    `;
                })
                .join("")
            : `<tr><td colspan="7">No orders recorded.</td></tr>`;
}

async function changeOrderStatus(
    orderId,
    status
) {
    const orders =
        getOrders();

    const order =
        orders.find(
            o => o.id === orderId
        );

    if (!order) return;

    if (order.status === "Received") {
        return;
    }

    if (status === "Received") {
        await receiveOrder(order);
    } else {
        if (!["To be ordered", "Ordered"].includes(status)) {
            return;
        }

        order.status =
            status;

        const saved =
            await saveOrders(orders);

        if (!saved) {
            alert(
                "The order status could not be saved to Supabase."
            );
        }
    }

    renderOrders();
}

async function receiveOrder(order) {
    if (order.status === "Received") {
        return true;
    }

    const materials =
        getMaterials();

    const material =
        materials.find(
            m => m.id === order.materialId
        );

    if (!material) {
        alert(
            "The material for this order could not be found."
        );
        return false;
    }

    if (material.type !== "consumable") {
        alert(
            "Only consumable / perishable materials can be received through the order system."
        );
        return false;
    }

    // Ask for the batch expiry BEFORE changing any stock.
    const expiryInput =
        prompt(
            "Enter the expiry date for the received batch (YYYY-MM-DD), or type INDEFINITE for no expiry:",
            material.expiryDate || "INDEFINITE"
        );

    if (expiryInput === null) {
        return false;
    }

    const expiry = normalizeExpiryValue(
        expiryInput,
        String(expiryInput).trim().toLowerCase() === "indefinite" ||
        String(expiryInput).trim().toLowerCase() === "no expiry"
    );

    if (expiry && daysUntil(expiry) === null) {
        alert(
            "Please enter a valid expiry date in YYYY-MM-DD format, or type INDEFINITE."
        );
        return false;
    }

    const quantity =
        Number(order.quantity || 0);

    material.quantity += quantity;
    material.availableQuantity =
        material.quantity;
    material.totalQuantity =
        material.quantity;
    material.batches =
        Array.isArray(material.batches)
            ? material.batches
            : [];

    material.batches.push({
        batchId: `${material.id}-B${String(material.batches.length + 1).padStart(2, "0")}`,
        dateAdded: todayISO(),
        quantityAdded: quantity,
        quantityRemaining: quantity,
        expiryDate: expiry
    });

    material.batches.sort(compareExpiry);

    material.expiryDate =
        material.batches[0]?.expiryDate ||
        expiry;

    const materialSnapshot =
        getMaterials();

    const materialSaved =
        await saveMaterials(materials);

    if (!materialSaved) {
        return false;
    }

    order.status = "Received";
    order.receivedQty = quantity;
    order.receivedDate = todayISO();

    const orders =
        getOrders();

    const targetOrder =
        orders.find(
            o => o.id === order.id
        );

    if (targetOrder) {
        Object.assign(
            targetOrder,
            order
        );
    }

    const orderSaved =
        await saveOrders(orders);

    if (!orderSaved) {
        // Best-effort rollback of the stock change.
        await saveMaterials(
            materialSnapshot
        );

        alert(
            "The order could not be marked received, so the stock update was rolled back."
        );

        return false;
    }

    const transactionSaved =
        await addTransaction({
            type: "add_stock",
            materialId: material.id,
            lab: material.lab,
            date: todayISO(),
            time: timeNow(),
            teacher: "Lab Assistant",
            quantity,
            status: "Order Received",
            remarks: `Received order ${order.id}`
        });

    if (!transactionSaved) {
        alert(
            "The order was marked received and stock was added, but the receipt history could not be saved."
        );
    }

    return true;
}

function openOrderForMaterial() {
    const m = currentMaterial();
    if (!m) return;

    window.location.href =
        `orders.html?material=${encodeURIComponent(m.id)}`;
}

/* ============================================================
   REPORTS
   ============================================================ */

function initReports() {
    document.getElementById("reportLabFilter")?.addEventListener("change", renderReports);
    document.getElementById("reportTypeFilter")?.addEventListener("change", renderReports);

    const transactions = getTransactions();
    setText("reportTransactionCount", transactions.length);
    setText("reportUsageCount", transactions.filter(t => t.type === "usage").length);
    setText("reportDamageCount", transactions.filter(t => t.type === "damage").length);
    setText("reportIssueCount", transactions.filter(t => t.type === "issue").length);

    renderReports();
}

function renderReports() {
    const body = document.getElementById("reportsTableBody");
    if (!body) return;

    const labFilter = document.getElementById("reportLabFilter")?.value || "all";
    const typeFilter = document.getElementById("reportTypeFilter")?.value || "all";
    const materials = getMaterials();

    let transactions = getTransactions().slice().reverse();

    if (labFilter !== "all") transactions = transactions.filter(t => t.lab === labFilter);
    if (typeFilter !== "all") transactions = transactions.filter(t => t.type === typeFilter);

    body.innerHTML = transactions.length ? transactions.map(t => {
        const m = materials.find(x => x.id === t.materialId);
        return `<tr>
            <td>${formatDate(t.date)} ${escapeHTML(t.time || "")}</td>
            <td>${escapeHTML(m?.name || t.materialId)}</td>
            <td>${escapeHTML(labName(t.lab))}</td>
            <td>${escapeHTML(activityLabel(t.type))}</td>
            <td>${t.quantity != null ? number(t.quantity) : "—"} ${escapeHTML(m?.unit || "")}</td>
            <td>${escapeHTML(t.teacher || "—")}</td>
            <td>${escapeHTML(t.remarks || "—")}</td>
        </tr>`;
    }).join("") : `<tr><td colspan="7">No transactions match the selected filters.</td></tr>`;
}

/* ============================================================
   NOTIFICATIONS
   ============================================================ */

function buildNotifications() {
    const materials = getMaterials();
    const transactions = getTransactions();
    const orders = getOrders();
    const notifications = [];

    materials
        .filter(m => m.status !== "deleted")
        .forEach(m => {
            if (isLowStock(m)) {
                notifications.push({
                    level: "warning",
                    icon: "⚠️",
                    title: "Low stock",
                    text: `${m.name} has ${number(stockValue(m))} ${m.unit} available; minimum is ${number(m.minimumStock)} ${m.unit}.`
                });
            }

            if (m.type === "consumable") {
                const activeBatchExpiries =
                    (Array.isArray(m.batches) ? m.batches : [])
                        .filter(batch => Number(batch.quantityRemaining || 0) > 0 && batch.expiryDate)
                        .map(batch => batch.expiryDate);

                const expiryDate =
                    activeBatchExpiries.length
                        ? activeBatchExpiries.sort()[0]
                        : m.expiryDate;

                const days = daysUntil(expiryDate);

                if (days !== null && days < 0) {
                    notifications.push({
                        level: "danger",
                        icon: "🔴",
                        title: "Expired chemical/material",
                        text: `${m.name} has stock associated with an expired batch (${formatDate(expiryDate)}).`
                    });
                } else if (days !== null && days <= 30) {
                    notifications.push({
                        level: "warning",
                        icon: "⏳",
                        title: "Expiry approaching",
                        text: `${m.name} has a batch expiring on ${formatDate(expiryDate)}.`
                    });
                }
            }
        });

    transactions
        .filter(t => t.type === "issue" && t.status === "Not Returned")
        .forEach(t => {
            if (t.expectedReturnDate && t.expectedReturnDate < todayISO()) {
                const m = materials.find(x => x.id === t.materialId);
                notifications.push({
                    level: "danger",
                    icon: "🚨",
                    title: "Equipment overdue",
                    text: `${m?.name || t.materialId}: ${number(t.quantity)} ${m?.unit || ""} issued to ${t.teacher || "teacher"} was due back on ${formatDate(t.expectedReturnDate)}.`
                });
            }
        });

    orders
        .filter(o => o.status === "Ordered")
        .forEach(o => {
            const m = materials.find(x => x.id === o.materialId);
            notifications.push({
                level: "info",
                icon: "📦",
                title: "Order awaiting receipt",
                text: `${number(o.quantity)} ${m?.unit || ""} of ${m?.name || o.materialId} is ordered but not yet received.`
            });
        });

    return notifications;
}

function initNotifications() {
    renderNotifications();
}

function renderNotifications() {
    const container = document.getElementById("notificationsContainer");
    if (!container) return;

    const notifications = buildNotifications();

    container.innerHTML = notifications.length
        ? notifications.map(notificationHTML).join("")
        : emptyNotificationHTML();
}

function notificationHTML(n) {
    return `<article class="notification-item notification-${n.level}">
        <div class="notification-icon">${n.icon}</div>
        <div><strong>${escapeHTML(n.title)}</strong><p>${escapeHTML(n.text)}</p></div>
    </article>`;
}

function emptyNotificationHTML() {
    return `<div class="empty-state"><div class="empty-state-icon">✓</div><h3>No active notifications</h3><p>Your inventory currently has no generated alerts.</p></div>`;
}

/* ============================================================
   HELPERS
   ============================================================ */

function showError(element, message) {
    if (!element) return;
    element.textContent = message;
    element.classList.remove("hidden");
}

function clearError(idOrElement) {
    const element = typeof idOrElement === "string" ? document.getElementById(idOrElement) : idOrElement;
    if (element) {
        element.textContent = "";
        element.classList.add("hidden");
    }
}

/* ============================================================
   GLOBAL RUNTIME ERROR REPORTING
   ============================================================ */

window.addEventListener("error", event => {
    console.error("Application error:", event.error || event.message);
});

window.addEventListener("unhandledrejection", event => {
    console.error("Unhandled promise rejection:", event.reason);
});
