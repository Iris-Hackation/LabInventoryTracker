-- ============================================================
-- SCIENCE LAB INVENTORY - SUPABASE DATABASE SETUP
-- ============================================================
-- Run this entire file in:
-- Supabase Dashboard -> SQL Editor -> New query -> Run
-- ============================================================

create table if not exists public.materials (
    id text primary key,
    name text not null,
    lab text not null check (lab in ('physics', 'chemistry', 'biology')),
    category text not null default '',
    type text not null check (type in ('reusable', 'consumable')),
    unit text not null default 'pieces',
    quantity numeric not null default 0 check (quantity >= 0),
    total_quantity numeric not null default 0 check (total_quantity >= 0),
    available_quantity numeric not null default 0 check (available_quantity >= 0),
    issued_quantity numeric not null default 0 check (issued_quantity >= 0),
    damaged_quantity numeric not null default 0 check (damaged_quantity >= 0),
    minimum_stock numeric not null default 0 check (minimum_stock >= 0),
    expiry_date date,
    batches jsonb not null default '[]'::jsonb,
    status text not null default 'active',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.transactions (
    id text primary key,
    material_id text references public.materials(id) on delete set null,
    lab text,
    type text not null,
    date date,
    time time,
    teacher text,
    quantity numeric not null default 0,
    status text,
    remarks text,
    expected_return_date date,
    actual_return_date date,
    issued_to text,
    created_at timestamptz not null default now()
);

create table if not exists public.orders (
    id text primary key,
    material_id text not null references public.materials(id) on delete restrict,
    quantity numeric not null check (quantity > 0),
    order_date date not null,
    status text not null check (status in ('To be ordered', 'Ordered', 'Received')),
    received_qty numeric not null default 0,
    received_date date,
    created_at timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists materials_lab_idx on public.materials(lab);
create index if not exists materials_type_idx on public.materials(type);
create index if not exists transactions_material_idx on public.transactions(material_id);
create index if not exists transactions_created_idx on public.transactions(created_at desc);
create index if not exists orders_material_idx on public.orders(material_id);
create index if not exists orders_status_idx on public.orders(status);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
-- The application authenticates the lab assistant through Supabase Auth.
-- Only authenticated users can read/write inventory data.

alter table public.materials enable row level security;
alter table public.transactions enable row level security;
alter table public.orders enable row level security;

drop policy if exists "Authenticated users can read materials" on public.materials;
drop policy if exists "Authenticated users can insert materials" on public.materials;
drop policy if exists "Authenticated users can update materials" on public.materials;
drop policy if exists "Authenticated users can delete materials" on public.materials;

create policy "Authenticated users can read materials"
on public.materials for select to authenticated using (true);

create policy "Authenticated users can insert materials"
on public.materials for insert to authenticated with check (true);

create policy "Authenticated users can update materials"
on public.materials for update to authenticated using (true) with check (true);

create policy "Authenticated users can delete materials"
on public.materials for delete to authenticated using (true);

drop policy if exists "Authenticated users can read transactions" on public.transactions;
drop policy if exists "Authenticated users can insert transactions" on public.transactions;
drop policy if exists "Authenticated users can update transactions" on public.transactions;
drop policy if exists "Authenticated users can delete transactions" on public.transactions;

create policy "Authenticated users can read transactions"
on public.transactions for select to authenticated using (true);

create policy "Authenticated users can insert transactions"
on public.transactions for insert to authenticated with check (true);

create policy "Authenticated users can update transactions"
on public.transactions for update to authenticated using (true) with check (true);

create policy "Authenticated users can delete transactions"
on public.transactions for delete to authenticated using (true);

drop policy if exists "Authenticated users can read orders" on public.orders;
drop policy if exists "Authenticated users can insert orders" on public.orders;
drop policy if exists "Authenticated users can update orders" on public.orders;
drop policy if exists "Authenticated users can delete orders" on public.orders;

create policy "Authenticated users can read orders"
on public.orders for select to authenticated using (true);

create policy "Authenticated users can insert orders"
on public.orders for insert to authenticated with check (true);

create policy "Authenticated users can update orders"
on public.orders for update to authenticated using (true) with check (true);

create policy "Authenticated users can delete orders"
on public.orders for delete to authenticated using (true);

-- ============================================================
-- DATA API GRANTS
-- ============================================================

grant select, insert, update, delete on public.materials to authenticated;
grant select, insert, update, delete on public.transactions to authenticated;
grant select, insert, update, delete on public.orders to authenticated;

-- ============================================================
-- SAMPLE MATERIALS
-- ============================================================
-- These are only inserted when the material ID does not already exist.

insert into public.materials
(id, name, lab, category, type, unit, quantity, total_quantity, available_quantity, issued_quantity, damaged_quantity, minimum_stock, expiry_date, batches, status)
values
('PHY-001','Vernier Caliper','physics','Measuring Instruments','reusable','pieces',12,12,12,0,0,4,null,'[]','active'),
('PHY-002','Digital Multimeter','physics','Electrical Instruments','reusable','pieces',8,8,8,0,0,3,null,'[]','active'),
('PHY-003','Convex Lens Set','physics','Optics','reusable','sets',6,6,6,0,0,2,null,'[]','active'),
('CHE-001','Hydrochloric Acid','chemistry','Acids','consumable','litres',5,5,5,0,0,2,'2027-03-15','[{"batchId":"CHE-001-B01","dateAdded":"2026-09-01","quantityAdded":5,"quantityRemaining":5,"expiryDate":"2027-03-15"}]','active'),
('CHE-002','Sodium Hydroxide','chemistry','Bases','consumable','kg',3,3,3,0,0,1,'2027-06-20','[{"batchId":"CHE-002-B01","dateAdded":"2026-09-01","quantityAdded":3,"quantityRemaining":3,"expiryDate":"2027-06-20"}]','active'),
('CHE-003','Copper Sulphate','chemistry','Salts','consumable','kg',0.8,0.8,0.8,0,0,1,'2027-01-10','[{"batchId":"CHE-003-B01","dateAdded":"2026-09-01","quantityAdded":0.8,"quantityRemaining":0.8,"expiryDate":"2027-01-10"}]','active'),
('BIO-001','Compound Microscope','biology','Microscopes','reusable','pieces',10,10,10,0,0,3,null,'[]','active'),
('BIO-002','Glass Microscope Slides','biology','Microscopy','reusable','boxes',6,6,6,0,0,2,null,'[]','active'),
('BIO-003','Dissection Kit','biology','Dissection Equipment','reusable','sets',7,7,7,0,0,2,null,'[]','active')
on conflict (id) do nothing;

-- ============================================================
-- IMPORTANT: create the first application user
-- ============================================================
-- In Supabase Dashboard:
-- Authentication -> Users -> Add user -> Create new user
-- Email:    labassistant@labinventory.local
-- Password: lab123
-- Set the user as confirmed if your project requires email confirmation.
--
-- The app lets the lab assistant type simply "labassistant" in the
-- login form; it maps that username to the Auth email above.
-- ============================================================
