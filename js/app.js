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
    {
        id:"PHY-001",
        name:"Vernier Caliper",
        lab:"physics",
        category:"Measuring Instruments",
        type:"reusable",
        unit:"pieces",
        quantity:12,
        totalQuantity:12,
        availableQuantity:12,
        issuedQuantity:0,
        damagedQuantity:0,
        minimumStock:4,
        expiryDate:null,
        status:"active"
    },
    {
        id:"PHY-002",
        name:"Digital Multimeter",
        lab:"physics",
        category:"Electrical Instruments",
        type:"reusable",
        unit:"pieces",
        quantity:8,
        totalQuantity:8,
        availableQuantity:8,
        issuedQuantity:0,
        damagedQuantity:0,
        minimumStock:3,
        expiryDate:null,
        status:"active"
    },
    {
        id:"PHY-003",
        name:"Convex Lens Set",
        lab:"physics",
        category:"Optics",
        type:"reusable",
        unit:"sets",
        quantity:6,
        totalQuantity:6,
        availableQuantity:6,
        issuedQuantity:0,
        damagedQuantity:0,
        minimumStock:2,
        expiryDate:null,
        status:"active"
    },
    {
        id:"CHE-001",
        name:"Hydrochloric Acid",
        lab:"chemistry",
        category:"Acids",
        type:"consumable",
        unit:"litres",
        quantity:5,
        totalQuantity:5,
        availableQuantity:5,
        issuedQuantity:0,
        damagedQuantity:0,
        minimumStock:2,
        expiryDate:"2027-03-15",
        batches:[
            {
                batchId:"CHE-001-B01",
                dateAdded:"2026-09-01",
                quantityAdded:5,
                quantityRemaining:5,
                expiryDate:"2027-03-15"
            }
        ],
        status:"active"
    },
    {
        id:"CHE-002",
        name:"Sodium Hydroxide",
        lab:"chemistry",
        category:"Bases",
        type:"consumable",
        unit:"kg",
        quantity:3,
        totalQuantity:3,
        availableQuantity:3,
        issuedQuantity:0,
        damagedQuantity:0,
        minimumStock:1,
        expiryDate:"2027-06-20",
        batches:[
            {
                batchId:"CHE-002-B01",
                dateAdded:"2026-09-01",
                quantityAdded:3,
                quantityRemaining:3,
                expiryDate:"2027-06-20"
            }
        ],
        status:"active"
    },
    {
        id:"CHE-003",
        name:"Copper Sulphate",
        lab:"chemistry",
        category:"Salts",
        type:"consumable",
        unit:"kg",
        quantity:0.8,
        totalQuantity:0.8,
        availableQuantity:0.8,
        issuedQuantity:0,
        damagedQuantity:0,
        minimumStock:1,
        expiryDate:"2027-01-10",
        batches:[
            {
                batchId:"CHE-003-B01",
                dateAdded:"2026-09-01",
                quantityAdded:0.8,
                quantityRemaining:0.8,
                expiryDate:"2027-01-10"
            }
        ],
        status:"active"
    },
    {
        id:"BIO-001",
        name:"Compound Microscope",
        lab:"biology",
        category:"Microscopes",
        type:"reusable",
        unit:"pieces",
        quantity:10,
        totalQuantity:10,
        availableQuantity:10,
        issuedQuantity:0,
        damagedQuantity:0,
        minimumStock:3,
        expiryDate:null,
        status:"active"
    },
    {
        id:"BIO-002",
        name:"Glass Microscope Slides",
        lab:"biology",
        category:"Microscopy",
        type:"reusable",
        unit:"boxes",
        quantity:6,
        totalQuantity:6,
        availableQuantity:6,
        issuedQuantity:0,
        damagedQuantity:0,
        minimumStock:2,
        expiryDate:null,
        status:"active"
    },
    {
        id:"BIO-003",
        name:"Dissection Kit",
        lab:"biology",
        category:"Dissection Equipment",
        type:"reusable",
        unit:"sets",
        quantity:7,
        totalQuantity:7,
        availableQuantity:7,
        issuedQuantity:0,
        damagedQuantity:0,
        minimumStock:2,
        expiryDate:null,
        status:"active"
    }
];


/* ============================================================
   PAGE STARTUP
   ============================================================ */

document.addEventListener("DOMContentLoaded", async () => {

    const allowed = await protectPages();

    if (!allowed) return;

    await initializeData();

    setCurrentUsername();

    bindGlobalEvents();

    initializePage();
});


/* ============================================================
   LOGIN / SESSION
   ============================================================ */

async function isLoggedIn() {

    const { data } = await supabaseClient.auth.getSession();

    return !!data.session;
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


/* ============================================================
   GLOBAL EVENTS
   ============================================================ */

function bindGlobalEvents() {

    const loginForm =
        document.getElementById("loginForm");

    if (loginForm) {

        loginForm.addEventListener(
            "submit",
            handleLogin
        );
    }


    document.addEventListener("click", (event) => {

        const overlay =
            event.target.closest(".modal-overlay");

        if (
            overlay &&
            event.target === overlay
        ) {

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
}


/* ============================================================
   LOGIN
   ============================================================ */

async function handleLogin(event) {

    event.preventDefault();

    const username =
        document.getElementById("username").value.trim();

    const password =
        document.getElementById("password").value;

    const error =
        document.getElementById("loginError");


    // Username "labassistant" is converted
    // to the Supabase authentication email.
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

        error.textContent =
            "Incorrect username or password.";

        error.classList.remove("hidden");

        return;
    }


    window.location.href =
        "dashboard.html";
}


/* ============================================================
   LOGOUT
   ============================================================ */

async function logout() {

    await supabaseClient.auth.signOut();

    DB.materials = [];
    DB.transactions = [];
    DB.orders = [];

    window.location.href =
        "index.html";
}


/* ============================================================
   CURRENT USER
   ============================================================ */

async function setCurrentUsername() {

    const { data } =
        await supabaseClient.auth.getUser();

    const username =
        data.user?.user_metadata?.username ||
        "labassistant";


    document
        .querySelectorAll("#currentUsername")
        .forEach(el => {

            el.textContent = username;
        });
}


/* ============================================================
   SUPABASE DATA STORAGE
   ============================================================ */

async function initializeData() {

    if (DB.initialized) return;


    const [
        materialsResult,
        transactionsResult,
        ordersResult
    ] = await Promise.all([

        supabaseClient
            .from("materials")
            .select("*")
            .order("id"),

        supabaseClient
            .from("transactions")
            .select("*")
            .order(
                "created_at",
                { ascending: true }
            ),

        supabaseClient
            .from("orders")
            .select("*")
            .order(
                "created_at",
                { ascending: true }
            )
    ]);


    if (
        materialsResult.error ||
        transactionsResult.error ||
        ordersResult.error
    ) {

        console.error(
            "Supabase load error:",
            materialsResult.error ||
            transactionsResult.error ||
            ordersResult.error
        );

        alert(
            "The app could not load its Supabase data. Check the SQL setup and RLS policies, then reload."
        );

        return;
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


    // Seed the database if there are no materials.
    if (!DB.materials.length) {

        let initial =
            DEFAULT_MATERIALS;


        try {

            const response =
                await fetch(
                    "data/materials.json",
                    { cache: "no-store" }
                );


            if (response.ok) {

                const json =
                    await response.json();


                if (
                    Array.isArray(json) &&
                    json.length
                ) {

                    initial = json;
                }
            }

        } catch (error) {

            // Built-in DEFAULT_MATERIALS is used.
        }


        DB.materials =
            normalizeMaterials(initial);


        await saveMaterials(
            DB.materials
        );
    }


    DB.initialized = true;
}


/* ============================================================
   NORMALIZE MATERIALS
   ============================================================ */

function normalizeMaterials(items) {

    return items.map(item => {

        const m = { ...item };


        m.type =
            String(
                m.type || "reusable"
            ).toLowerCase();


        m.quantity =
            Number(m.quantity || 0);


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


        m.batches =
            Array.isArray(m.batches)
                ? m.batches
                : [];


        if (m.type === "consumable") {

            m.totalQuantity =
                Number(m.quantity || 0);

            m.availableQuantity =
                Number(m.quantity || 0);
        }


        return m;
    });
}


/* ============================================================
   MATERIAL → SUPABASE
   ============================================================ */

function toDbMaterial(m) {

    return {

        id: m.id,

        name: m.name,

        lab: m.lab,

        category: m.category,

        type: m.type,

        unit: m.unit,

        quantity:
            Number(m.quantity || 0),

        total_quantity:
            Number(m.totalQuantity || 0),

        available_quantity:
            Number(m.availableQuantity || 0),

        issued_quantity:
            Number(m.issuedQuantity || 0),

        damaged_quantity:
            Number(m.damagedQuantity || 0),

        minimum_stock:
            Number(m.minimumStock || 0),

        expiry_date:
            m.expiryDate || null,

        batches:
            Array.isArray(m.batches)
                ? m.batches
                : [],

        status:
            m.status || "active"
    };
}


/* ============================================================
   SAVE MATERIALS
   ============================================================ */

async function saveMaterials(materials) {

    DB.materials =
        normalizeMaterials(materials);


    const rows =
        DB.materials.map(
            toDbMaterial
        );


    const { error } =
        await supabaseClient
            .from("materials")
            .upsert(
                rows,
                { onConflict: "id" }
            );


    if (error) {

        console.error(
            "Supabase material save error:",
            error
        );
    }
}


function getMaterials() {

    return normalizeMaterials(
        DB.materials
    );
}


/* ============================================================
   TRANSACTIONS
   ============================================================ */

function toDbTransaction(t) {

    return {

        id: t.id,

        material_id:
            t.materialId || null,

        lab:
            t.lab || null,

        type:
            t.type || null,

        date:
            t.date || null,

        time:
            t.time || null,

        teacher:
            t.teacher || null,

        quantity:
            Number(t.quantity || 0),

        status:
            t.status || null,

        remarks:
            t.remarks || null,

        expected_return_date:
            t.expectedReturnDate || null,

        actual_return_date:
            t.actualReturnDate || null,

        issued_to:
            t.issuedTo || null,

        created_at:
            t.createdAt ||
            new Date().toISOString()
    };
}


function fromDbTransaction(t) {

    return {

        id: t.id,

        materialId:
            t.material_id,

        lab: t.lab,

        type: t.type,

        date: t.date,

        time: t.time,

        teacher: t.teacher,

        quantity:
            Number(t.quantity || 0),

        status: t.status,

        remarks: t.remarks,

        expectedReturnDate:
            t.expected_return_date,

        actualReturnDate:
            t.actual_return_date,

        issuedTo:
            t.issued_to,

        createdAt:
            t.created_at
    };
}


function getTransactions() {

    return DB.transactions.slice();
}


async function saveTransactions(items) {

    DB.transactions =
        items.slice();


    const rows =
        DB.transactions.map(
            toDbTransaction
        );


    const { error } =
        await supabaseClient
            .from("transactions")
            .upsert(
                rows,
                { onConflict: "id" }
            );


    if (error) {

        console.error(
            "Supabase transaction save error:",
            error
        );
    }
}


/* ============================================================
   ORDERS
   ============================================================ */

function toDbOrder(o) {

    return {

        id: o.id,

        material_id:
            o.materialId,

        quantity:
            Number(o.quantity || 0),

        order_date:
            o.orderDate,

        status:
            o.status,

        received_qty:
            Number(o.receivedQty || 0),

        received_date:
            o.receivedDate || null,

        created_at:
            o.createdAt ||
            new Date().toISOString()
    };
}


function fromDbOrder(o) {

    return {

        id: o.id,

        materialId:
            o.material_id,

        quantity:
            Number(o.quantity || 0),

        orderDate:
            o.order_date,

        status:
            o.status,

        receivedQty:
            Number(o.received_qty || 0),

        receivedDate:
            o.received_date,

        createdAt:
            o.created_at
    };
}


function getOrders() {

    return DB.orders.slice();
}


async function saveOrders(items) {

    DB.orders =
        items.slice();


    const rows =
        DB.orders.map(
            toDbOrder
        );


    const { error } =
        await supabaseClient
            .from("orders")
            .upsert(
                rows,
                { onConflict: "id" }
            );


    if (error) {

        console.error(
            "Supabase order save error:",
            error
        );
    }
}


/* ============================================================
   HELPER FUNCTIONS
   ============================================================ */

function generateId(prefix) {

    return `${prefix}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 7)}`;
}


function todayISO() {

    return new Date()
        .toISOString()
        .slice(0, 10);
}


function timeNow() {

    return new Date()
        .toTimeString()
        .slice(0, 5);
}


function addDays(dateString, days) {

    const date =
        new Date(
            `${dateString}T00:00:00`
        );

    date.setDate(
        date.getDate() + days
    );

    return date
        .toISOString()
        .slice(0, 10);
}


function formatDate(value) {

    if (!value) return "—";

    const date =
        new Date(
            `${value}T00:00:00`
        );

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

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
        ? lab.charAt(0).toUpperCase() +
          lab.slice(1)
        : "—";
}


function typeName(type) {

    return type === "consumable"
        ? "Consumable / Perishable"
        : "Reusable";
}


function stockValue(material) {

    return material.type === "reusable"
        ? Number(
            material.availableQuantity || 0
        )
        : Number(
            material.quantity || 0
        );
}


function isLowStock(material) {

    return stockValue(material) <=
        Number(
            material.minimumStock || 0
        );
}


function daysUntil(dateString) {

    if (!dateString) return null;

    const today =
        new Date(
            `${todayISO()}T00:00:00`
        );

    const target =
        new Date(
            `${dateString}T00:00:00`
        );

    return Math.ceil(
        (target - today) /
        86400000
    );
}


/* ============================================================
   NAVIGATION
   ============================================================ */

function openLab(labNameValue) {

    if (
        !APP.labs.includes(
            labNameValue
        )
    ) {

        return;
    }

    window.location.href =
        `inventory.html?lab=${encodeURIComponent(
            labNameValue
        )}`;
}


/* ============================================================
   PAGE INITIALIZATION
   ============================================================ */

function initializePage() {

    const page =
        location.pathname
            .split("/")
            .pop();


    if (
        page === "dashboard.html"
    ) {

        initDashboard();
    }


    if (
        page === "inventory.html"
    ) {

        initInventory();
    }


    if (
        page === "material.html"
    ) {

        initMaterial();
    }


    if (
        page === "reports.html"
    ) {

        initReports();
    }


    if (
        page === "orders.html"
    ) {

        initOrders();
    }


    if (
        page === "notifications.html"
    ) {

        initNotifications();
    }
}


/* ============================================================
   DASHBOARD
   ============================================================ */

function initDashboard() {

    const materials =
        getMaterials();


    setText(
        "totalMaterials",
        materials.length
    );


    setText(
        "lowStockMaterials",
        materials.filter(
            isLowStock
        ).length
    );


    setText(
        "reusableMaterials",
        materials.filter(
            m => m.type === "reusable"
        ).length
    );


    setText(
        "consumableMaterials",
        materials.filter(
            m => m.type === "consumable"
        ).length
    );


    const container =
        document.getElementById(
            "dashboardNotifications"
        );


    if (container) {

        const notifications =
            buildNotifications()
                .slice(0, 5);


        container.innerHTML =
            notifications.length
                ? notifications
                    .map(notificationHTML)
                    .join("")
                : emptyNotificationHTML();
    }
}


function setText(id, value) {

    const el =
        document.getElementById(id);

    if (el) {

        el.textContent = value;
    }
}


/* ============================================================
   INVENTORY PAGE
   ============================================================ */

function initInventory() {

    const params =
        new URLSearchParams(
            location.search
        );

    const lab =
        params.get("lab");


    if (!APP.labs.includes(lab)) {

        document.getElementById(
            "labTitle"
        ).textContent =
            "Select a Laboratory";

        renderInventory([]);

        return;
    }


    document.title =
        `${labName(lab)} Inventory - Lab Inventory`;


    document.getElementById(
        "labTitle"
    ).textContent =
        `${labName(lab)} Laboratory`;


    const labSelect =
        document.getElementById(
            "newMaterialLab"
        );


    if (labSelect) {

        labSelect.value = lab;
    }


    const search =
        document.getElementById(
            "inventorySearch"
        );


    const typeFilter =
        document.getElementById(
            "inventoryTypeFilter"
        );


    if (search) {

        search.addEventListener(
            "input",
            renderCurrentInventory
        );
    }


    if (typeFilter) {

        typeFilter.addEventListener(
            "change",
            renderCurrentInventory
        );
    }


    const form =
        document.getElementById(
            "addMaterialForm"
        );


    if (form) {

        form.addEventListener(
            "submit",
            saveMaterialFromForm
        );
    }


    const type =
        document.getElementById(
            "newMaterialType"
        );


    if (type) {

        type.addEventListener(
            "change",
            updateExpiryVisibility
        );
    }


    updateExpiryVisibility();

    renderCurrentInventory();
}


function renderCurrentInventory() {

    const params =
        new URLSearchParams(
            location.search
        );


    const lab =
        params.get("lab");


    const search =
        (
            document.getElementById(
                "inventorySearch"
            )?.value || ""
        )
            .trim()
            .toLowerCase();


    const type =
        document.getElementById(
            "inventoryTypeFilter"
        )?.value || "all";


    let materials =
        getMaterials().filter(
            m =>
                m.lab === lab &&
                m.status !== "deleted"
        );


    if (type !== "all") {

        materials =
            materials.filter(
                m => m.type === type
            );
    }


    if (search) {

        materials =
            materials.filter(
                m =>
                    [
                        m.name,
                        m.category,
                        m.unit,
                        m.id
                    ].some(
                        v =>
                            String(v || "")
                                .toLowerCase()
                                .includes(search)
                    )
            );
    }


    renderInventory(materials);
}


function renderInventory(materials) {

    const container =
        document.getElementById(
            "inventoryContainer"
        );


    if (!container) return;


    if (!materials.length) {

        container.innerHTML = `
            <div class="empty-state full-width">
                <div class="empty-state-icon">📦</div>
                <h3>No materials found</h3>
                <p>Try another search or add a new material.</p>
            </div>
        `;

        return;
    }


    container.innerHTML =
        materials
            .map(materialCardHTML)
            .join("");
}


function materialCardHTML(m) {

    const stock =
        stockValue(m);


    const low =
        isLowStock(m);


    const expiry =
        m.type === "consumable"
            ? expiryStatus(
                m.expiryDate
            )
            : null;


    return `
        <article class="material-card">

            <div class="material-card-top">

                <span class="type-badge">
                    ${escapeHTML(
                        typeName(m.type)
                    )}
                </span>

                <span class="stock-badge ${
                    low
                        ? "stock-low"
                        : "stock-ok"
                }">

                    ${
                        low
                            ? "Low Stock"
                            : "In Stock"
                    }

                </span>

            </div>

            <h3>
                ${escapeHTML(m.name)}
            </h3>

            <p class="material-category">
                ${escapeHTML(m.category)}
            </p>

            <div class="material-card-stats">

                <div>
                    <span>Available</span>

                    <strong>
                        ${number(stock)}
                        ${escapeHTML(m.unit)}
                    </strong>
                </div>

                <div>
                    <span>Minimum</span>

                    <strong>
                        ${number(
                            m.minimumStock
                        )}
                        ${escapeHTML(m.unit)}
                    </strong>
                </div>

            </div>

            ${
                m.type === "reusable"

                    ? `
                        <p class="small-muted">
                            Total:
                            ${number(
                                m.totalQuantity
                            )}

                            · Issued:
                            ${number(
                                m.issuedQuantity
                            )}

                            · Damaged:
                            ${number(
                                m.damagedQuantity
                            )}
                        </p>
                    `

                    : `
                        <p class="expiry-line ${
                            expiry?.class || ""
                        }">

                            Expiry:
                            ${escapeHTML(
                                formatDate(
                                    m.expiryDate
                                )
                            )}

                            ${
                                expiry?.label
                                    ? ` · ${expiry.label}`
                                    : ""
                            }

                        </p>
                    `
            }

            <a
                class="card-action"
                href="material.html?id=${encodeURIComponent(
                    m.id
                )}"
            >
                View Details →
            </a>

        </article>
    `;
}


function expiryStatus(date) {

    if (!date) {

        return {
            class: "expiry-warning",
            label: "No expiry date"
        };
    }


    const days =
        daysUntil(date);


    if (days < 0) {

        return {
            class: "expiry-danger",
            label: "Expired"
        };
    }


    if (days <= 30) {

        return {
            class: "expiry-warning",
            label:
                `${days} day${
                    days === 1
                        ? ""
                        : "s"
                } left`
        };
    }


    return {
        class: "expiry-ok",
        label: "Valid"
    };
}


/* ============================================================
   ADD / EDIT / DELETE MATERIAL
   ============================================================ */

function openAddMaterialForm(
    materialId = null
) {

    const modal =
        document.getElementById(
            "addMaterialModal"
        );


    if (!modal) return;


    const form =
        document.getElementById(
            "addMaterialForm"
        );


    form.reset();


    document.getElementById(
        "editingMaterialId"
    ).value =
        materialId || "";


    document.getElementById(
        "materialFormTitle"
    ).textContent =
        materialId
            ? "Edit Material"
            : "Add New Material";


    const params =
        new URLSearchParams(
            location.search
        );


    document.getElementById(
        "newMaterialLab"
    ).value =
        params.get("lab") ||
        "physics";


    if (materialId) {

        const m =
            getMaterials().find(
                x => x.id === materialId
            );


        if (!m) return;


        document.getElementById(
            "newMaterialLab"
        ).value =
            m.lab;


        document.getElementById(
            "newMaterialName"
        ).value =
            m.name;


        document.getElementById(
            "newMaterialCategory"
        ).value =
            m.category;


        document.getElementById(
            "newMaterialType"
        ).value =
            m.type;


        document.getElementById(
            "newMaterialUnit"
        ).value =
            m.unit;


        document.getElementById(
            "newMaterialQuantity"
        ).value =
            stockValue(m);


        document.getElementById(
            "newMaterialMinimum"
        ).value =
            m.minimumStock;


        document.getElementById(
            "newMaterialExpiry"
        ).value =
            m.expiryDate || "";
    }


    updateExpiryVisibility();

    clearError(
        "materialFormError"
    );


    modal.classList.remove(
        "hidden"
    );
}


function closeAddMaterialForm() {

    document
        .getElementById(
            "addMaterialModal"
        )
        ?.classList.add(
            "hidden"
        );
}


function updateExpiryVisibility() {

    const type =
        document.getElementById(
            "newMaterialType"
        )?.value;


    const group =
        document.getElementById(
            "newExpiryGroup"
        );


    const input =
        document.getElementById(
            "newMaterialExpiry"
        );


    if (!group || !input) return;


    const show =
        type === "consumable";


    group.classList.toggle(
        "hidden",
        !show
    );


    input.required =
        show;
}


/* ============================================================
   SAVE MATERIAL FORM
   ============================================================ */

function saveMaterialFromForm(event) {

    event.preventDefault();


    const idBeingEdited =
        document.getElementById(
            "editingMaterialId"
        ).value;


    const lab =
        document.getElementById(
            "newMaterialLab"
        ).value;


    const type =
        document.getElementById(
            "newMaterialType"
        ).value;


    const quantity =
        Number(
            document.getElementById(
                "newMaterialQuantity"
            ).value
        );


    const minimum =
        Number(
            document.getElementById(
                "newMaterialMinimum"
            ).value
        );


    const expiry =
        document.getElementById(
            "newMaterialExpiry"
        ).value || null;


    const error =
        document.getElementById(
            "materialFormError"
        );


    if (
        !lab ||
        !APP.labs.includes(lab)
    ) {

        return showError(
            error,
            "Please select a valid laboratory."
        );
    }


    if (
        quantity < 0 ||
        minimum < 0
    ) {

        return showError(
            error,
            "Quantity values cannot be negative."
        );
    }


    if (
        type === "consumable" &&
        !expiry
    ) {

        return showError(
            error,
            "Consumable materials need an expiry date."
        );
    }


    const materials =
        getMaterials();


    if (idBeingEdited) {

        const m =
            materials.find(
                x => x.id === idBeingEdited
            );


        if (!m) return;


        const oldStock =
            stockValue(m);


        const newStock =
            quantity;


        m.name =
            document.getElementById(
                "newMaterialName"
            ).value.trim();


        m.category =
            document.getElementById(
                "newMaterialCategory"
            ).value.trim();


        m.lab =
            lab;


        m.type =
            type;


        m.unit =
            document.getElementById(
                "newMaterialUnit"
            ).value.trim();


        m.minimumStock =
            minimum;


        m.expiryDate =
            type === "consumable"
                ? expiry
                : null;


        if (type === "reusable") {

            const issued =
                Number(
                    m.issuedQuantity || 0
                );


            const damaged =
                Number(
                    m.damagedQuantity || 0
                );


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


            m.batches =
                m.batches || [];
        }


        if (
            oldStock !==
            newStock
        ) {

            addTransaction({

                type:
                    "stock_adjustment",

                materialId:
                    m.id,

                lab:
                    m.lab,

                date:
                    todayISO(),

                time:
                    timeNow(),

                quantity:
                    newStock -
                    oldStock,

                teacher:
                    "Lab Assistant",

                remarks:
                    "Manual stock adjustment while editing material"
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

            id:
                newId,

            name:
                document.getElementById(
                    "newMaterialName"
                ).value.trim(),

            lab:
                lab,

            category:
                document.getElementById(
                    "newMaterialCategory"
                ).value.trim(),

            type:
                type,

            unit:
                document.getElementById(
                    "newMaterialUnit"
                ).value.trim(),

            quantity:
                quantity,

            totalQuantity:
                quantity,

            availableQuantity:
                quantity,

            issuedQuantity:
                0,

            damagedQuantity:
                0,

            minimumStock:
                minimum,

            expiryDate:
                type === "consumable"
                    ? expiry
                    : null,

            status:
                "active"
        };


        if (
            type ===
            "consumable"
        ) {

            m.batches = [

                {

                    batchId:
                        `${newId}-B01`,

                    dateAdded:
                        todayISO(),

                    quantityAdded:
                        quantity,

                    quantityRemaining:
                        quantity,

                    expiryDate:
                        expiry
                }

            ];
        }


        materials.push(m);
    }


    saveMaterials(
        materials
    );


    closeAddMaterialForm();


    renderCurrentInventory();


    initDashboardIfVisible();
}


/* ============================================================
   EDIT MATERIAL
   ============================================================ */

function editMaterial(id) {

    openAddMaterialForm(id);
}


/* ============================================================
   DELETE MATERIAL
   ============================================================ */

function deleteMaterial(id) {

    const materials =
        getMaterials();


    const m =
        materials.find(
            x => x.id === id
        );


    if (!m) return;


    if (
        !confirm(
            `Delete "${m.name}" from the inventory? This will hide the material from the inventory.`
        )
    ) {

        return;
    }


    m.status =
        "deleted";


    saveMaterials(
        materials
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

    const id =
        new URLSearchParams(
            location.search
        ).get("id");


    const material =
        getMaterials().find(
            m =>
                m.id === id &&
                m.status !== "deleted"
        );


    if (!material) {

        document.getElementById(
            "materialDetailsContainer"
        ).innerHTML = `

            <div class="empty-state">

                <h3>
                    Material not found
                </h3>

                <p>
                    The requested material does not exist.
                </p>

                <a
                    class="card-action"
                    href="dashboard.html"
                >
                    Return to Dashboard
                </a>

            </div>
        `;

        return;
    }


    document.title =
        `${material.name} - Lab Inventory`;


    document.getElementById(
        "materialPageTitle"
    ).textContent =
        material.name;


    document.getElementById(
        "backToInventory"
    ).href =
        `inventory.html?lab=${material.lab}`;


    setupMaterialForms(
        material
    );


    renderMaterialDetails(
        material
    );
}


/* ============================================================
   MATERIAL DETAILS
   ============================================================ */

function renderMaterialDetails(
    material
) {

    const container =
        document.getElementById(
            "materialDetailsContainer"
        );


    const stock =
        stockValue(material);


    const low =
        isLowStock(material);


    const transactions =
        getTransactions()
            .filter(
                t =>
                    t.materialId ===
                    material.id
            )
            .slice(-8)
            .reverse();


    let actionButtons =
        "";


    if (
        material.type ===
        "reusable"
    ) {

        actionButtons = `

            <button
                class="primary-button"
                onclick="openIssueModal()"
            >
                Issue / Usage
            </button>

            <button
                class="secondary-button"
                onclick="openReturnModal()"
            >
                Return Equipment
            </button>

            <button
                class="danger-button"
                onclick="openDamageModal()"
            >
                Damage Report
            </button>
        `;

    } else {

        actionButtons = `

            <button
                class="primary-button"
                onclick="openUsageModal()"
            >
                Usage Report
            </button>

            <button
                class="secondary-button"
                onclick="openAddStockModal()"
            >
                Add Quantity
            </button>

            <button
                class="secondary-button"
                onclick="openOrderForMaterial()"
            >
                Create Order
            </button>

            <button
                class="danger-button"
                onclick="openDamageModal()"
            >
                Damage Report
            </button>
        `;
    }


    const batchHTML =
        material.type === "consumable" &&
        material.batches?.length

            ? `

                <div class="panel mt-20">

                    <div class="section-heading">

                        <p>
                            Stock Batches
                        </p>

                        <h2>
                            Expiry Tracking
                        </h2>

                    </div>

                    <div class="table-container">

                        <table>

                            <thead>

                                <tr>

                                    <th>
                                        Batch
                                    </th>

                                    <th>
                                        Added
                                    </th>

                                    <th>
                                        Remaining
                                    </th>

                                    <th>
                                        Expiry
                                    </th>

                                </tr>

                            </thead>

                            <tbody>

                                ${
                                    material.batches
                                        .filter(
                                            b =>
                                                Number(
                                                    b.quantityRemaining
                                                ) > 0
                                        )
                                        .map(
                                            b => `

                                                <tr>

                                                    <td>
                                                        ${escapeHTML(
                                                            b.batchId
                                                        )}
                                                    </td>

                                                    <td>
                                                        ${formatDate(
                                                            b.dateAdded
                                                        )}
                                                    </td>

                                                    <td>
                                                        ${number(
                                                            b.quantityRemaining
                                                        )}
                                                        ${escapeHTML(
                                                            material.unit
                                                        )}
                                                    </td>

                                                    <td>
                                                        ${formatDate(
                                                            b.expiryDate
                                                        )}
                                                    </td>

                                                </tr>

                                            `
                                        )
                                        .join("")

                                    ||

                                    `
                                        <tr>
                                            <td colspan="4">
                                                No active batches.
                                            </td>
                                        </tr>
                                    `
                                }

                            </tbody>

                        </table>

                    </div>

                </div>
            `

            : "";


    container.innerHTML = `

        <section class="material-details-card">

            <div class="detail-header">

                <div>

                    <span class="type-badge">

                        ${escapeHTML(
                            typeName(
                                material.type
                            )
                        )}

                    </span>

                    <h2>

                        ${escapeHTML(
                            material.name
                        )}

                    </h2>

                    <p>

                        ${escapeHTML(
                            material.category
                        )}

                        ·

                        ${escapeHTML(
                            labName(
                                material.lab
                            )
                        )}

                    </p>

                </div>


                <div class="detail-header-actions">

                    <button
                        class="secondary-button"
                        onclick="editMaterialFromDetails()"
                    >
                        Edit
                    </button>

                    <button
                        class="danger-outline-button"
                        onclick="deleteMaterial('${escapeHTML(
                            material.id
                        )}')"
                    >
                        Delete
                    </button>

                </div>

            </div>


            <div class="details-grid">

                <div class="detail-item">

                    <span>
                        Material ID
                    </span>

                    <strong>
                        ${escapeHTML(
                            material.id
                        )}
                    </strong>

                </div>


                <div class="detail-item">

                    <span>
                        Unit
                    </span>

                    <strong>
                        ${escapeHTML(
                            material.unit
                        )}
                    </strong>

                </div>


                <div class="detail-item">

                    <span>
                        Available
                    </span>

                    <strong>

                        ${number(stock)}

                        ${escapeHTML(
                            material.unit
                        )}

                    </strong>

                </div>


                <div class="detail-item">

                    <span>
                        Minimum Stock
                    </span>

                    <strong>

                        ${number(
                            material.minimumStock
                        )}

                        ${escapeHTML(
                            material.unit
                        )}

                    </strong>

                </div>


                <div class="detail-item">

                    <span>
                        Stock Status
                    </span>

                    <strong
                        class="${
                            low
                                ? "text-danger"
                                : "text-success"
                        }"
                    >

                        ${
                            low
                                ? "Low Stock"
                                : "Healthy"
                        }

                    </strong>

                </div>


                ${
                    material.type ===
                    "reusable"

                        ? `

                            <div class="detail-item">

                                <span>
                                    Total Quantity
                                </span>

                                <strong>

                                    ${number(
                                        material.totalQuantity
                                    )}

                                    ${escapeHTML(
                                        material.unit
                                    )}

                                </strong>

                            </div>


                            <div class="detail-item">

                                <span>
                                    Currently Issued
                                </span>

                                <strong>

                                    ${number(
                                        material.issuedQuantity
                                    )}

                                    ${escapeHTML(
                                        material.unit
                                    )}

                                </strong>

                            </div>


                            <div class="detail-item">

                                <span>
                                    Damaged
                                </span>

                                <strong>

                                    ${number(
                                        material.damagedQuantity
                                    )}

                                    ${escapeHTML(
                                        material.unit
                                    )}

                                </strong>

                            </div>

                        `

                        : `

                            <div class="detail-item">

                                <span>
                                    Expiry
                                </span>

                                <strong>

                                    ${formatDate(
                                        material.expiryDate
                                    )}

                                </strong>

                            </div>

                        `
                }

            </div>


            <div class="material-actions">

                ${actionButtons}

            </div>

        </section>


        ${batchHTML}


        <section class="panel mt-20">

            <div class="section-heading">

                <p>
                    History
                </p>

                <h2>
                    Recent Activity
                </h2>

            </div>


            <div class="table-container">

                <table>

                    <thead>

                        <tr>

                            <th>
                                Date
                            </th>

                            <th>
                                Activity
                            </th>

                            <th>
                                Qty
                            </th>

                            <th>
                                Teacher
                            </th>

                            <th>
                                Status
                            </th>

                            <th>
                                Remarks
                            </th>

                        </tr>

                    </thead>


                    <tbody>

                        ${
                            transactions.length

                                ? transactions
                                    .map(
                                        t => `

                                            <tr>

                                                <td>

                                                    ${formatDate(
                                                        t.date
                                                    )}

                                                    ${escapeHTML(
                                                        t.time || ""
                                                    )}

                                                </td>

                                                <td>

                                                    ${escapeHTML(
                                                        activityLabel(
                                                            t.type
                                                        )
                                                    )}

                                                </td>

                                                <td>

                                                    ${
                                                        t.quantity != null
                                                            ? number(
                                                                t.quantity
                                                            )
                                                            : "—"
                                                    }

                                                </td>

                                                <td>

                                                    ${escapeHTML(
                                                        t.teacher ||
                                                        "—"
                                                    )}

                                                </td>

                                                <td>

                                                    ${escapeHTML(
                                                        t.status ||
                                                        "Completed"
                                                    )}

                                                </td>

                                                <td>

                                                    ${escapeHTML(
                                                        t.remarks ||
                                                        "—"
                                                    )}

                                                </td>

                                            </tr>

                                        `
                                    )
                                    .join("")

                                : `

                                    <tr>

                                        <td colspan="6">

                                            No activity recorded yet.

                                        </td>

                                    </tr>

                                `
                        }

                    </tbody>

                </table>

            </div>

        </section>
    `;
}


/* ============================================================
   CURRENT MATERIAL
   ============================================================ */

function currentMaterial() {

    const id =
        new URLSearchParams(
            location.search
        ).get("id");


    return getMaterials().find(
        m =>
            m.id === id &&
            m.status !== "deleted"
    );
}


/* ============================================================
   EDIT FROM DETAILS
   ============================================================ */

function editMaterialFromDetails() {

    const m =
        currentMaterial();


    if (!m) return;


    window.location.href =
        `inventory.html?lab=${m.lab}&edit=${encodeURIComponent(
            m.id
        )}`;
}


/* ============================================================
   MATERIAL MODALS
   ============================================================ */

function setupMaterialForms(
    material
) {

    const dateFields = [
        "issueDate",
        "returnDate",
        "usageDate",
        "stockAddDate",
        "damageDate"
    ];


    dateFields.forEach(
        id => {

            const el =
                document.getElementById(
                    id
                );


            if (el) {

                el.value =
                    todayISO();
            }
        }
    );


    const timeFields = [
        "issueTime",
        "returnTime",
        "damageTime"
    ];


    timeFields.forEach(
        id => {

            const el =
                document.getElementById(
                    id
                );


            if (el) {

                el.value =
                    timeNow();
            }
        }
    );


    const expected =
        document.getElementById(
            "expectedReturnDate"
        );


    if (expected) {

        expected.value =
            addDays(
                todayISO(),
                3
            );
    }


    document
        .getElementById(
            "issueForm"
        )
        ?.addEventListener(
            "submit",
            submitIssue
        );


    document
        .getElementById(
            "returnForm"
        )
        ?.addEventListener(
            "submit",
            submitReturn
        );


    document
        .getElementById(
            "damageForm"
        )
        ?.addEventListener(
            "submit",
            submitDamage
        );


    document
        .getElementById(
            "usageForm"
        )
        ?.addEventListener(
            "submit",
            submitUsage
        );


    document
        .getElementById(
            "addStockForm"
        )
        ?.addEventListener(
            "submit",
            submitAddStock
        );
}


function openModal(id) {

    document
        .getElementById(id)
        ?.classList.remove(
            "hidden"
        );
}


function closeModal(id) {

    document
        .getElementById(id)
        ?.classList.add(
            "hidden"
        );
}


function openIssueModal() {

    openModal(
        "issueModal"
    );
}


function openReturnModal() {

    openModal(
        "returnModal"
    );
}


function openDamageModal() {

    openModal(
        "damageModal"
    );
}


function openUsageModal() {

    openModal(
        "usageModal"
    );
}


function openAddStockModal() {

    openModal(
        "addStockModal"
    );
}


/* ============================================================
   ISSUE / USAGE FOR REUSABLE ITEMS
   ============================================================ */

function submitIssue(event) {

    event.preventDefault();


    const m =
        currentMaterial();


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


    if (
        qty <= 0 ||
        qty > available
    ) {

        return showError(
            document.getElementById(
                "issueError"
            ),
            `Only ${number(
                available
            )} ${m.unit} are available.`
        );
    }


    const materials =
        getMaterials();


    const target =
        materials.find(
            x => x.id === m.id
        );


    target.availableQuantity -=
        qty;


    target.issuedQuantity +=
        qty;


    target.quantity =
        target.availableQuantity;


    saveMaterials(
        materials
    );


    addTransaction({

        type:
            "issue",

        materialId:
            m.id,

        lab:
            m.lab,

        date:
            document.getElementById(
                "issueDate"
            ).value,

        time:
            document.getElementById(
                "issueTime"
            ).value,

        teacher,

        quantity:
            qty,

        expectedReturnDate:
            document.getElementById(
                "expectedReturnDate"
            ).value,

        status:
            "Not Returned",

        remarks:
            document.getElementById(
                "issueRemarks"
            ).value.trim()
    });


    closeModal(
        "issueModal"
    );


    initMaterial();
}


/* ============================================================
   RETURN
   ============================================================ */

function submitReturn(event) {

    event.preventDefault();


    const m =
        currentMaterial();


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


    if (
        qty <= 0 ||
        qty >
            Number(
                m.issuedQuantity || 0
            )
    ) {

        return showError(
            document.getElementById(
                "returnError"
            ),
            `Currently issued: ${number(
                m.issuedQuantity
            )} ${m.unit}.`
        );
    }


    const materials =
        getMaterials();


    const target =
        materials.find(
            x => x.id === m.id
        );


    target.availableQuantity +=
        qty;


    target.issuedQuantity -=
        qty;


    target.quantity =
        target.availableQuantity;


    saveMaterials(
        materials
    );


    addTransaction({

        type:
            "return",

        materialId:
            m.id,

        lab:
            m.lab,

        date:
            document.getElementById(
                "returnDate"
            ).value,

        time:
            document.getElementById(
                "returnTime"
            ).value,

        teacher,

        quantity:
            qty,

        status:
            "Returned",

        remarks:
            document.getElementById(
                "returnRemarks"
            ).value.trim()
    });


    const transactions =
        getTransactions();


    let remaining =
        qty;


    for (
        let i = 0;
        i <
            transactions.length &&
            remaining > 0;
        i++
    ) {

        const t =
            transactions[i];


        if (
            t.materialId ===
                m.id &&
            t.type ===
                "issue" &&
            t.status ===
                "Not Returned"
        ) {

            const used =
                Math.min(
                    Number(
                        t.quantity
                    ),
                    remaining
                );


            t.quantity =
                Number(
                    t.quantity
                ) - used;


            if (
                t.quantity <= 0
            ) {

                t.status =
                    "Returned";
            }


            remaining -=
                used;
        }
    }


    saveTransactions(
        transactions
    );


    closeModal(
        "returnModal"
    );


    initMaterial();
}


/* ============================================================
   DAMAGE REPORT
   ============================================================ */

function submitDamage(event) {

    event.preventDefault();


    const m =
        currentMaterial();


    if (!m) return;


    const qty =
        Number(
            document.getElementById(
                "damageQuantity"
            ).value
        );


    const available =
        stockValue(m);


    if (
        qty <= 0 ||
        qty > available
    ) {

        return showError(
            document.getElementById(
                "damageError"
            ),
            `Only ${number(
                available
            )} ${m.unit} are currently available.`
        );
    }


    const materials =
        getMaterials();


    const target =
        materials.find(
            x => x.id === m.id
        );


    if (
        target.type ===
        "reusable"
    ) {

        target.availableQuantity -=
            qty;

        target.totalQuantity -=
            qty;

        target.damagedQuantity +=
            qty;

        target.quantity =
            target.availableQuantity;

    } else {

        target.quantity -=
            qty;

        target.availableQuantity =
            target.quantity;

        target.damagedQuantity =
            Number(
                target.damagedQuantity || 0
            ) + qty;

        reduceBatches(
            target,
            qty
        );
    }


    saveMaterials(
        materials
    );


    addTransaction({

        type:
            "damage",

        materialId:
            m.id,

        lab:
            m.lab,

        date:
            document.getElementById(
                "damageDate"
            ).value,

        time:
            document.getElementById(
                "damageTime"
            ).value,

        teacher:
            document.getElementById(
                "damageTeacher"
            ).value.trim(),

        quantity:
            qty,

        status:
            "Damaged",

        remarks:
            document.getElementById(
                "damageRemarks"
            ).value.trim()
    });


    closeModal(
        "damageModal"
    );


    initMaterial();
}


/* ============================================================
   CONSUMABLE USAGE
   ============================================================ */

function submitUsage(event) {

    event.preventDefault();


    const m =
        currentMaterial();


    if (!m) return;


    const qty =
        Number(
            document.getElementById(
                "usageQuantity"
            ).value
        );


    if (
        qty <= 0 ||
        qty > stockValue(m)
    ) {

        return showError(
            document.getElementById(
                "usageError"
            ),
            `Available: ${number(
                stockValue(m)
            )} ${m.unit}.`
        );
    }


    const materials =
        getMaterials();


    const target =
        materials.find(
            x => x.id === m.id
        );


    target.quantity -=
        qty;


    target.availableQuantity =
        target.quantity;


    reduceBatches(
        target,
        qty
    );


    saveMaterials(
        materials
    );


    addTransaction({

        type:
            "usage",

        materialId:
            m.id,

        lab:
            m.lab,

        date:
            document.getElementById(
                "usageDate"
            ).value,

        time:
            timeNow(),

        teacher:
            document.getElementById(
                "usageTeacher"
            ).value.trim(),

        quantity:
            qty,

        status:
            "Used",

        remarks:
            document.getElementById(
                "usageRemarks"
            ).value.trim()
    });


    closeModal(
        "usageModal"
    );


    initMaterial();
}
