"""
ONE-TIME setup script — populates the `zones` table with your campus's
real camera/sensor zone configuration.

This is NOT dummy incident data — it's static infrastructure config
(where each camera/sensor is installed, and whether that spot is a
CCTV-permitted or strictly-private zone), the same way a real school's
device inventory would be seeded once when SafeZone is first installed.
Incidents, alerts, and audit log entries are never seeded — those stay
empty until real events happen through the app.

Usage (from the safezone-backend folder, venv active):
    python seed_zones.py

Safe to re-run: it upserts by zone id, so re-running just refreshes the
config rather than duplicating rows.
"""
from app.supabase_client import get_client

ZONES = [
    {
        "id": "zone-main-corridor",
        "name": "Main Corridor",
        "category": "Corridor",
        "privacy_level": "Permitted Surveillance",
        "device_type": "CCTV Camera (Optical)",
        "device_status": "Active & Healthy",
        "coverage_description": "Dual wide-angle 1080p optical sensors covering hallway throughput and locker bays.",
        "cctv_permitted": True,
        "coordinates": {"x": 18, "y": 35, "width": 34, "height": 14},
        "marker": {"x": 35, "y": 42, "type": "camera"},
    },
    {
        "id": "zone-cafeteria",
        "name": "Cafeteria",
        "category": "Cafeteria",
        "privacy_level": "Permitted Surveillance",
        "device_type": "CCTV Camera (Optical)",
        "device_status": "Active & Healthy",
        "coverage_description": "Ceiling mounted camera over seating area & meal counters for rush hour safety.",
        "cctv_permitted": True,
        "coordinates": {"x": 54, "y": 15, "width": 28, "height": 26},
        "marker": {"x": 68, "y": 28, "type": "camera"},
    },
    {
        "id": "zone-courtyard",
        "name": "Courtyard",
        "category": "Outdoor",
        "privacy_level": "Permitted Surveillance",
        "device_type": "CCTV Camera (Optical)",
        "device_status": "Active & Healthy",
        "coverage_description": "Exterior weather-proof perimeter optical camera covering open benches and quad.",
        "cctv_permitted": True,
        "coordinates": {"x": 54, "y": 45, "width": 28, "height": 32},
        "marker": {"x": 68, "y": 60, "type": "camera"},
    },
    {
        "id": "zone-staircase",
        "name": "Staircase East",
        "category": "Corridor",
        "privacy_level": "Permitted Surveillance",
        "device_type": "CCTV Camera (Optical)",
        "device_status": "Active & Healthy",
        "coverage_description": "Angle covering stair treads and emergency egress doors.",
        "cctv_permitted": True,
        "coordinates": {"x": 84, "y": 25, "width": 12, "height": 22},
        "marker": {"x": 90, "y": 36, "type": "camera"},
    },
    {
        "id": "zone-sports-hall",
        "name": "Sports Hall & Gym",
        "category": "Sports",
        "privacy_level": "Permitted Surveillance",
        "device_type": "CCTV Camera (Optical)",
        "device_status": "Active & Healthy",
        "coverage_description": "High-bay camera viewing bleachers and basketball courts during open gym.",
        "cctv_permitted": True,
        "coordinates": {"x": 84, "y": 52, "width": 12, "height": 35},
        "marker": {"x": 90, "y": 70, "type": "camera"},
    },
    {
        "id": "zone-classroom-corridor",
        "name": "Classroom Corridor B",
        "category": "Academic",
        "privacy_level": "Permitted Surveillance",
        "device_type": "Student Emergency Help Point",
        "device_status": "Active & Healthy",
        "coverage_description": "Interactive wall-mounted help button and intercom station between classrooms 201-208.",
        "cctv_permitted": True,
        "coordinates": {"x": 18, "y": 15, "width": 34, "height": 16},
        "marker": {"x": 26, "y": 22, "type": "help_point"},
    },
    {
        "id": "zone-toilet-entrance",
        "name": "Toilet Entrance West",
        "category": "Hygiene/Restroom",
        "privacy_level": "Strictly Private (No Video)",
        "device_type": "Acoustic / Vape Sensor (Non-Visual)",
        "device_status": "Active & Healthy",
        "coverage_description": "Privacy-first acoustic threshold & particulate sensor at outer foyer. Zero video/audio recording.",
        "cctv_permitted": False,
        "coordinates": {"x": 4, "y": 20, "width": 12, "height": 22},
        "marker": {"x": 10, "y": 30, "type": "sensor"},
    },
    {
        "id": "zone-changing-room",
        "name": "Changing-Room Entrance",
        "category": "Hygiene/Restroom",
        "privacy_level": "Strictly Private (No Video)",
        "device_type": "Acoustic / Vape Sensor (Non-Visual)",
        "device_status": "Active & Healthy",
        "coverage_description": "Acoustic spike detector and physical panic button outside locker entrance. Strictly no cameras.",
        "cctv_permitted": False,
        "coordinates": {"x": 4, "y": 52, "width": 12, "height": 26},
        "marker": {"x": 10, "y": 65, "type": "sensor"},
    },
]


def main() -> None:
    client = get_client()
    client.table("zones").upsert(ZONES).execute()
    print(f"✅ Seeded {len(ZONES)} zones into Supabase.")


if __name__ == "__main__":
    main()