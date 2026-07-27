$ErrorActionPreference = "Stop"
$env:PGPASSWORD="qwerty"

Write-Host "Dropping and recreating database 'vehicle_count'..."
psql -U postgres -h localhost -p 5432 -d postgres -c "DROP DATABASE IF EXISTS vehicle_count WITH (FORCE);"
psql -U postgres -h localhost -p 5432 -d postgres -f "00_create_database.sql"

$files = Get-ChildItem -Path ".\*.sql" | Where-Object { $_.Name -ne "00_create_database.sql" } | Sort-Object Name

foreach ($file in $files) {
    Write-Host "Applying $($file.Name)..."
    psql -U postgres -h localhost -p 5432 -d vehicle_count -f $file.FullName
}

Write-Host "Database schema rebuilt successfully!"
