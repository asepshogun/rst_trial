CREATE TABLE IF NOT EXISTS master_classes (
    code VARCHAR(50) PRIMARY KEY,
    label VARCHAR(100) NOT NULL,
    description TEXT,
    sort_order INTEGER NOT NULL UNIQUE CHECK (sort_order >= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO master_classes (code, label, description, sort_order)
VALUES
    ('1', 'Motorcycle', 'Motorcycles and two-wheeled vehicles.', 1),
    ('2', 'Car / Sedan / SUV', 'Private cars, sedans, jeeps, and station wagons.', 2),
    ('3', 'Angkutan Umum', 'Public transport passenger vehicles (Angkot).', 3),
    ('4', 'Pickup / Micro Truck', 'Pickups and micro delivery trucks.', 4),
    ('5', 'Bus', 'Buses and medium-to-large passenger buses.', 5),
    ('6', '2-Axle Truck', 'Medium 2-axle cargo trucks.', 6),
    ('7', '3-Axle Truck', 'Heavy 3-axle and large jumbo trucks.', 7)
ON CONFLICT (code) DO UPDATE
SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order;
