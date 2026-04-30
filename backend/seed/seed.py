"""
TWIN CHECK — Seed Script
========================
Inserts all demo data required for XRCC 2026 presentation.

Seed data:
    - 6 user accounts (3 adjuster, 3 HQ)
    - 44 claims (30 unassigned, 9 assigned, 5 ready_for_review)
    - 44 policies (one per claim)
    - coverage_items for all 44 policies
    - incident_patterns for all 44 policies

Run with:
    python -m seed.seed

Requires DATABASE_URL environment variable or .env file.
Idempotent: clears existing seed data before re-inserting.
"""

import asyncio
import os
import sys
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID, uuid4

import bcrypt
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Allow running from backend/ directory
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.models import (
    Claim,
    ClaimStatus,
    CoverageItem,
    Evidence,
    EvidenceType,
    GsJob,
    GsJobStatus,
    IncidentPattern,
    Policy,
    Report,
    User,
    UserRole,
)

# ============================================================
# Component type master list
# MUST match GLB mesh object names exactly
# ============================================================

COMPONENT_TYPES = {
    # Tier 1 — Core
    "impeller", "pump_casing", "casing_cover", "shaft",
    "bearing", "bearing_housing", "mechanical_seal", "wear_ring",
    # Tier 2 — Secondary
    "shaft_sleeve", "packing_gland", "coupling", "motor", "base_frame",
}

# Incident type → expected damaged components (for fraud detection)
INCIDENT_PATTERNS = {
    "cavitation":          ["impeller", "wear_ring", "pump_casing"],
    "seal_failure":        ["mechanical_seal", "shaft_sleeve", "packing_gland"],
    "bearing_failure":     ["bearing", "bearing_housing", "shaft"],
    "mechanical_overload": ["impeller", "shaft", "bearing"],
    "misalignment":        ["shaft", "coupling", "bearing"],
    "corrosion":           ["pump_casing", "impeller", "wear_ring"],
}

# Coverage items per incident type — what's covered, what's not
# Format: {component_type: (clause, covered)}
COVERAGE_BY_INCIDENT = {
    "cavitation": {
        "impeller":       ("4.1.1", True),
        "wear_ring":      ("4.1.2", True),
        "pump_casing":    ("4.1.3", True),
        "bearing":        ("4.2.1", False),
        "mechanical_seal":("4.3.1", False),
    },
    "seal_failure": {
        "mechanical_seal":("4.3.1", True),
        "shaft_sleeve":   ("4.3.2", True),
        "packing_gland":  ("4.3.3", True),
        "shaft":          ("4.1.4", False),
        "impeller":       ("4.1.1", False),
    },
    "bearing_failure": {
        "bearing":        ("4.2.1", True),
        "bearing_housing":("4.2.2", True),
        "shaft":          ("4.1.4", True),
        "coupling":       ("4.4.1", False),
        "impeller":       ("4.1.1", False),
    },
    "mechanical_overload": {
        "impeller":       ("4.1.1", True),
        "shaft":          ("4.1.4", True),
        "bearing":        ("4.2.1", True),
        "wear_ring":      ("4.1.2", True),
        "coupling":       ("4.4.1", False),
    },
    "misalignment": {
        "shaft":          ("4.1.4", True),
        "coupling":       ("4.4.1", True),
        "bearing":        ("4.2.1", True),
        "motor":          ("4.5.1", False),
        "impeller":       ("4.1.1", False),
    },
    "corrosion": {
        "pump_casing":    ("4.1.3", True),
        "impeller":       ("4.1.1", True),
        "wear_ring":      ("4.1.2", True),
        "shaft":          ("4.1.4", False),
        "mechanical_seal":("4.3.1", False),
    },
}

# ============================================================
# Demo claim data — realistic industrial sites across Europe
# ============================================================

# (company, site_city, site_country, claimed_amount, insured_value, incident_type, cad_ref)
CLAIM_TEMPLATES = [
    # Incident types cycle through all 6 for variety
    ("Aqua Systems GmbH",           "Hamburg",     "Germany",     42000,  180000, "cavitation",          "pump_centrifugal_001"),
    ("FluidTech Iberica S.L.",       "Barcelona",   "Spain",       67000,  220000, "seal_failure",        "pump_centrifugal_002"),
    ("Noord Pomp B.V.",              "Rotterdam",   "Netherlands", 38000,  150000, "bearing_failure",     "pump_centrifugal_003"),
    ("Pompe Industriali S.r.l.",     "Milan",       "Italy",       91000,  300000, "mechanical_overload", "pump_centrifugal_004"),
    ("Vízgép Kft.",                  "Budapest",    "Hungary",     55000,  200000, "misalignment",        "pump_centrifugal_005"),
    ("Wassertechnik AG",             "Zurich",      "Switzerland", 73000,  250000, "corrosion",           "pump_centrifugal_006"),
    ("Hydraulik Nord GmbH",          "Berlin",      "Germany",     29000,  120000, "cavitation",          "pump_centrifugal_001"),
    ("Bomba Técnica Lda.",           "Lisbon",      "Portugal",    44000,  175000, "seal_failure",        "pump_centrifugal_002"),
    ("Pumpenwerk Österreich GmbH",   "Vienna",      "Austria",     82000,  280000, "bearing_failure",     "pump_centrifugal_003"),
    ("Fluidmaster Polska Sp. z o.o.","Warsaw",      "Poland",      36000,  140000, "mechanical_overload", "pump_centrifugal_004"),
    ("Centrifugal Systems Ltd.",     "Manchester",  "UK",          61000,  210000, "misalignment",        "pump_centrifugal_005"),
    ("Hydrotech Scandinavia AB",     "Gothenburg",  "Sweden",      48000,  190000, "corrosion",           "pump_centrifugal_006"),
    ("Prečerpávacia Technika s.r.o.","Bratislava",  "Slovakia",    33000,  130000, "cavitation",          "pump_centrifugal_001"),
    ("Pompaj Industri Sh.p.k.",      "Tirana",      "Albania",     27000,  110000, "seal_failure",        "pump_centrifugal_002"),
    ("Fluid Engineering A/S",        "Copenhagen",  "Denmark",     59000,  205000, "bearing_failure",     "pump_centrifugal_003"),
    ("Süleyman Pompa San. A.Ş.",     "Istanbul",    "Turkey",      88000,  290000, "mechanical_overload", "pump_centrifugal_004"),
    ("Pompes Industrielles SA",      "Lyon",        "France",      46000,  185000, "misalignment",        "pump_centrifugal_005"),
    ("Čerpadla Bohemia s.r.o.",      "Prague",      "Czech Rep.",  31000,  125000, "corrosion",           "pump_centrifugal_006"),
    ("Pumpentechnik Schweiz AG",     "Basel",       "Switzerland", 77000,  260000, "cavitation",          "pump_centrifugal_001"),
    ("Fluid Systems Hellas S.A.",    "Athens",      "Greece",      52000,  195000, "seal_failure",        "pump_centrifugal_002"),
    ("Industriepumpen Bayern GmbH",  "Munich",      "Germany",     39000,  155000, "bearing_failure",     "pump_centrifugal_003"),
    ("Centrifugal Technics NV",      "Antwerp",     "Belgium",     66000,  225000, "mechanical_overload", "pump_centrifugal_004"),
    ("Hydrodynamics Nordic Oy",      "Helsinki",    "Finland",     43000,  170000, "misalignment",        "pump_centrifugal_005"),
    ("Pumptechnik Ruhr GmbH",        "Dortmund",    "Germany",     57000,  200000, "corrosion",           "pump_centrifugal_006"),
    ("Aquapump Eesti OÜ",            "Tallinn",     "Estonia",     28000,  115000, "cavitation",          "pump_centrifugal_001"),
    ("Pomp & Vloeistof BV",          "Amsterdam",   "Netherlands", 71000,  240000, "seal_failure",        "pump_centrifugal_002"),
    ("Hydraulic Engineering SRL",    "Bucharest",   "Romania",     35000,  135000, "bearing_failure",     "pump_centrifugal_003"),
    ("Pump Solutions Iberia S.A.",   "Madrid",      "Spain",       84000,  275000, "mechanical_overload", "pump_centrifugal_004"),
    ("Wasserpumpen Norddeutschland", "Bremen",      "Germany",     41000,  165000, "misalignment",        "pump_centrifugal_005"),
    ("Fluidtec Adriatica S.r.l.",    "Venice",      "Italy",       63000,  215000, "corrosion",           "pump_centrifugal_006"),
    # Claims 31–39: assigned to adjusters
    ("Rheinische Pumpenwerke GmbH",  "Cologne",     "Germany",     95000,  310000, "cavitation",          "pump_centrifugal_001"),
    ("Baltic Fluid Systems UAB",     "Vilnius",     "Lithuania",   47000,  185000, "seal_failure",        "pump_centrifugal_002"),
    ("Zentrifugal AG",               "Bern",        "Switzerland", 68000,  230000, "bearing_failure",     "pump_centrifugal_003"),
    ("Pompería Catalana S.L.",       "Tarragona",   "Spain",       53000,  195000, "mechanical_overload", "pump_centrifugal_004"),
    ("Hydroflow Systems Ltd.",       "Birmingham",  "UK",          79000,  260000, "misalignment",        "pump_centrifugal_005"),
    ("Průmyslová Čerpadla a.s.",     "Brno",        "Czech Rep.",  34000,  132000, "corrosion",           "pump_centrifugal_006"),
    ("Fluidpumpen Sachsen GmbH",     "Dresden",     "Germany",     61000,  210000, "cavitation",          "pump_centrifugal_001"),
    ("Hydraulique Industrielle SARL","Marseille",   "France",      88000,  285000, "seal_failure",        "pump_centrifugal_002"),
    ("Pompownia Wielkopolska Sp.k.", "Poznań",      "Poland",      45000,  175000, "bearing_failure",     "pump_centrifugal_003"),
    # Claims 40–44: ready_for_review (full data, pre-rendered splats)
    ("Müller Industrietechnik GmbH", "Munich",      "Germany",     95000,  250000, "mechanical_overload", "pump_centrifugal_004"),
    ("Nordpump Fabrik AS",           "Oslo",        "Norway",      82000,  270000, "misalignment",        "pump_centrifugal_005"),
    ("Adriatic Fluid Engineering",   "Split",       "Croatia",     71000,  235000, "corrosion",           "pump_centrifugal_006"),
    ("Magyar Szivattyú Zrt.",        "Debrecen",    "Hungary",     63000,  220000, "cavitation",          "pump_centrifugal_001"),
    ("Eidgenössische Pumpentechnik", "Lausanne",    "Switzerland", 109000, 320000, "seal_failure",        "pump_centrifugal_002"),
]

# Site contacts per company (index matches CLAIM_TEMPLATES)
SITE_CONTACTS = [
    "Klaus Weber — +49 40 123456",        "Carlos Ruiz — +34 93 234567",
    "Jan de Vries — +31 10 345678",       "Marco Bianchi — +39 02 456789",
    "Kovács István — +36 1 567890",       "Hans Müller — +41 44 678901",
    "Friedrich Braun — +49 30 789012",    "António Silva — +351 21 890123",
    "Wolfgang Gruber — +43 1 901234",     "Piotr Nowak — +48 22 012345",
    "James Smith — +44 161 123456",       "Erik Lindqvist — +46 31 234567",
    "Martin Kovář — +421 2 345678",       "Artan Hoxha — +355 4 456789",
    "Lars Nielsen — +45 32 567890",       "Mehmet Yilmaz — +90 212 678901",
    "Pierre Dubois — +33 4 789012",       "Tomáš Novák — +420 5 890123",
    "Beat Keller — +41 61 901234",        "Nikos Papadopoulos — +30 21 012345",
    "Stefan Huber — +49 89 123457",       "Luc Janssen — +32 3 234568",
    "Mikael Virtanen — +358 9 345679",    "Ralf Zimmermann — +49 231 456780",
    "Andres Tamm — +372 6 567891",        "Pieter van Dam — +31 20 678902",
    "Ion Popescu — +40 21 789013",        "Ricardo Fernández — +34 91 890124",
    "Bernd Schuster — +49 421 901235",    "Gianni Moretti — +39 41 012346",
    "Thomas Richter — +49 221 123458",    "Tomas Kazlauskas — +370 5 234569",
    "Urs Frei — +41 31 345680",           "Jordi Puig — +34 977 456791",
    "David Jones — +44 121 567892",       "Jiří Dvořák — +420 5 678903",
    "Heiko Schreiber — +49 351 789014",   "Jean-Pierre Martin — +33 4 890125",
    "Bartosz Wróblewski — +48 61 901236",
    "Klaus Weber — +49 89 234568",        "Bjørn Andersen — +47 22 345681",
    "Ante Marić — +385 21 456792",        "Nagy Zoltán — +36 52 567893",
    "Céline Rochat — +41 21 678904",
]


def make_policy_number(index: int) -> str:
    return f"POL-2026-{index + 1:05d}"


def make_equipment_qr(incident_type: str, index: int) -> str:
    prefix = incident_type.upper()[:3]
    return f"EQ-SACI-CP-{prefix}-{index + 1:04d}"


async def run_seed(db: AsyncSession) -> None:
    print("Clearing existing seed data...")
    # Delete in reverse FK order
    for table in [
        "gs_jobs", "damage_findings", "evidence", "reports",
        "equipment", "coverage_items", "incident_patterns",
        "policies", "claims", "users",
    ]:
        await db.execute(text(f"DELETE FROM {table}"))
    await db.commit()
    print("Cleared.")

    # ============================================================
    # Users
    # ============================================================
    print("Inserting users...")
    password_hash = bcrypt.hashpw("demo1234".encode(), bcrypt.gensalt()).decode()

    adjuster_ids = [uuid4(), uuid4(), uuid4()]
    hq_ids = [uuid4(), uuid4(), uuid4()]

    users = [
        User(id=adjuster_ids[0], email="adjuster_1@twincheck.demo",
             password_hash=password_hash, name="Hans Mueller", role=UserRole.adjuster),
        User(id=adjuster_ids[1], email="adjuster_2@twincheck.demo",
             password_hash=password_hash, name="Anna Schmidt", role=UserRole.adjuster),
        User(id=adjuster_ids[2], email="adjuster_3@twincheck.demo",
             password_hash=password_hash, name="Erik Johansson", role=UserRole.adjuster),
        User(id=hq_ids[0], email="hq_1@twincheck.demo",
             password_hash=password_hash, name="Sarah Chen", role=UserRole.hq),
        User(id=hq_ids[1], email="hq_2@twincheck.demo",
             password_hash=password_hash, name="Marco Rossi", role=UserRole.hq),
        User(id=hq_ids[2], email="hq_3@twincheck.demo",
             password_hash=password_hash, name="Lena Fischer", role=UserRole.hq),
    ]
    db.add_all(users)
    await db.flush()
    print(f"  {len(users)} users inserted.")

    # ============================================================
    # Claims
    # ============================================================
    print("Inserting claims...")

    claim_ids = [uuid4() for _ in range(44)]
    claims = []

    for i, (company, city, country, claimed_amt, _, incident_type, _cad) in enumerate(CLAIM_TEMPLATES):
        if i < 30:
            # Unassigned
            status = ClaimStatus.unassigned
            assigned_to = None
        elif i < 39:
            # Assigned — 3 per adjuster
            status = ClaimStatus.assigned
            adjuster_index = (i - 30) // 3
            assigned_to = adjuster_ids[adjuster_index]
        else:
            # Ready for review
            status = ClaimStatus.ready_for_review
            assigned_to = adjuster_ids[(i - 39) % 3]

        claim = Claim(
            id=claim_ids[i],
            assigned_to=assigned_to,
            status=status,
            site_address=f"{company} Plant, {city}, {country}",
            site_contact=SITE_CONTACTS[i],
            claimed_amount=Decimal(str(CLAIM_TEMPLATES[i][3])),
        )
        claims.append(claim)

    db.add_all(claims)
    await db.flush()
    print(f"  {len(claims)} claims inserted.")

    # ============================================================
    # Policies, CoverageItems, IncidentPatterns
    # ============================================================
    print("Inserting policies, coverage items, incident patterns...")

    policies = []
    coverage_items = []
    incident_pattern_rows = []

    for i, (company, city, country, claimed_amt, insured_val, incident_type, cad_ref) in enumerate(CLAIM_TEMPLATES):
        policy_id = uuid4()
        policy = Policy(
            id=policy_id,
            claim_id=claim_ids[i],
            policy_number=make_policy_number(i),
            holder_name=company,
            coverage_start=date(2025, 1, 1),
            coverage_end=date(2025, 12, 31),
            insured_value=Decimal(str(insured_val)),
            equipment_type="Centrifugal Pump",
            incident_type=incident_type,
        )
        policies.append(policy)

        # Coverage items from master map
        for component_type, (clause, covered) in COVERAGE_BY_INCIDENT[incident_type].items():
            coverage_items.append(CoverageItem(
                policy_id=policy_id,
                component_type=component_type,
                clause=clause,
                covered=covered,
            ))

        # Incident patterns from master map
        for component_type in INCIDENT_PATTERNS[incident_type]:
            incident_pattern_rows.append(IncidentPattern(
                policy_id=policy_id,
                incident_type=incident_type,
                component_type=component_type,
            ))

    db.add_all(policies)
    await db.flush()
    db.add_all(coverage_items)
    db.add_all(incident_pattern_rows)
    await db.flush()
    print(f"  {len(policies)} policies, {len(coverage_items)} coverage items, "
          f"{len(incident_pattern_rows)} incident patterns inserted.")

    # ============================================================
    # Reports (empty rows for assigned + ready_for_review claims)
    # ============================================================
    print("Inserting report rows...")
    reports = []
    for i in range(30, 44):
        reports.append(Report(claim_id=claim_ids[i]))
    db.add_all(reports)
    await db.flush()
    print(f"  {len(reports)} report rows inserted.")

    # ============================================================
    # Ready-for-review claims (40–44): GS jobs with completed status
    # Splat URLs reference pre-rendered .ply files
    # Evidence, damage_findings are inserted separately via seed_rfr.py
    # ============================================================
    print("Inserting GS jobs for ready_for_review claims...")
    gs_jobs = []
    splat_files = [
        "splat_claim_40.ply", "splat_claim_41.ply", "splat_claim_42.ply",
        "splat_claim_43.ply", "splat_claim_44.ply",
    ]
    for i, splat_file in enumerate(splat_files):
        gs_jobs.append(GsJob(
            claim_id=claim_ids[39 + i],
            status=GsJobStatus.completed,
            runpod_job_id=f"rp-seed-{39 + i:03d}",
            splat_url=f"https://placeholder.supabase.co/storage/v1/object/public/splats/{splat_file}",
            started_at=datetime(2026, 4, 20, 10, 0, tzinfo=timezone.utc),
            completed_at=datetime(2026, 4, 20, 10, 14, tzinfo=timezone.utc),
        ))
    db.add_all(gs_jobs)
    await db.flush()
    print(f"  {len(gs_jobs)} GS jobs inserted.")

    await db.commit()
    print("\nSeed complete.")
    print(f"  Unassigned claims : 30")
    print(f"  Assigned claims   : 9  (3 per adjuster)")
    print(f"  Ready for review  : 5")
    print(f"  Total             : 44")
    print(f"\nDemo accounts (password: demo1234):")
    print(f"  adjuster_1@twincheck.demo  →  Hans Mueller")
    print(f"  adjuster_2@twincheck.demo  →  Anna Schmidt")
    print(f"  adjuster_3@twincheck.demo  →  Erik Johansson")
    print(f"  hq_1@twincheck.demo        →  Sarah Chen")
    print(f"  hq_2@twincheck.demo        →  Marco Rossi")
    print(f"  hq_3@twincheck.demo        →  Lena Fischer")


async def main() -> None:
    from dotenv import load_dotenv
    load_dotenv()

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL not set. Create a .env file or set the variable.")
        sys.exit(1)

    engine = create_async_engine(
        database_url,
        pool_pre_ping=True,
    )
    session_factory = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False
    )

    async with session_factory() as session:
        await run_seed(session)

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())