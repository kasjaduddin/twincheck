"""
SQLAlchemy ORM models for all 10 tables.

Column types and constraints match TwinCheck_DatabaseSchema.md v1.0 exactly.
Enum values are defined as Python Enum classes for type safety.
"""

import enum
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


# ============================================================
# Enum definitions — mirror PostgreSQL ENUM types
# ============================================================

class UserRole(str, enum.Enum):
    adjuster = "adjuster"
    hq = "hq"


class ClaimStatus(str, enum.Enum):
    unassigned = "unassigned"
    assigned = "assigned"
    on_site = "on_site"
    completed = "completed"
    ready_for_review = "ready_for_review"
    reconstruction_failed = "reconstruction_failed"
    under_review = "under_review"
    approved = "approved"
    escalated = "escalated"
    rejected = "rejected"


class CadMatch(str, enum.Enum):
    full = "full"
    partial = "partial"
    not_available = "not_available"


class DamageSeverity(str, enum.Enum):
    red = "red"
    amber = "amber"
    green = "green"


class EvidenceType(str, enum.Enum):
    audio = "audio"
    video = "video"
    point_cloud = "point_cloud"
    splat = "splat"


class GsJobStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"


# ============================================================
# ORM Models
# ============================================================

class User(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    assigned_claims: Mapped[list["Claim"]] = relationship(
        "Claim", back_populates="adjuster", foreign_keys="Claim.assigned_to"
    )


class Claim(Base):
    __tablename__ = "claims"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    assigned_to: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[ClaimStatus] = mapped_column(
        Enum(ClaimStatus, name="claim_status"),
        nullable=False,
        server_default="unassigned",
    )
    site_address: Mapped[str] = mapped_column(Text, nullable=False)
    site_contact: Mapped[str] = mapped_column(String(255), nullable=False)
    claimed_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    adjuster: Mapped[User | None] = relationship(
        "User", back_populates="assigned_claims", foreign_keys=[assigned_to]
    )
    policy: Mapped["Policy | None"] = relationship(
        "Policy", back_populates="claim", uselist=False
    )
    equipment: Mapped["Equipment | None"] = relationship(
        "Equipment", back_populates="claim", uselist=False
    )
    report: Mapped["Report | None"] = relationship(
        "Report", back_populates="claim", uselist=False
    )
    damage_findings: Mapped[list["DamageFinding"]] = relationship(
        "DamageFinding", back_populates="claim"
    )
    evidence: Mapped[list["Evidence"]] = relationship(
        "Evidence", back_populates="claim"
    )
    gs_job: Mapped["GsJob | None"] = relationship(
        "GsJob", back_populates="claim", uselist=False
    )


class Policy(Base):
    __tablename__ = "policies"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    claim_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("claims.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    policy_number: Mapped[str] = mapped_column(String(100), nullable=False)
    holder_name: Mapped[str] = mapped_column(String(255), nullable=False)
    coverage_start: Mapped[date] = mapped_column(Date, nullable=False)
    coverage_end: Mapped[date] = mapped_column(Date, nullable=False)
    insured_value: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    equipment_type: Mapped[str] = mapped_column(String(255), nullable=False)
    incident_type: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    claim: Mapped[Claim] = relationship("Claim", back_populates="policy")
    coverage_items: Mapped[list["CoverageItem"]] = relationship(
        "CoverageItem", back_populates="policy"
    )
    incident_patterns: Mapped[list["IncidentPattern"]] = relationship(
        "IncidentPattern", back_populates="policy"
    )


class CoverageItem(Base):
    __tablename__ = "coverage_items"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    policy_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("policies.id", ondelete="CASCADE"),
        nullable=False,
    )
    # MUST match GLB mesh object name exactly — e.g. 'impeller', 'pump_casing'
    component_type: Mapped[str] = mapped_column(String(100), nullable=False)
    clause: Mapped[str] = mapped_column(String(50), nullable=False)
    covered: Mapped[bool] = mapped_column(Boolean, nullable=False)

    # Relationships
    policy: Mapped[Policy] = relationship("Policy", back_populates="coverage_items")

    __table_args__ = (
        Index("idx_coverage_items_policy", "policy_id", "component_type"),
    )


class IncidentPattern(Base):
    __tablename__ = "incident_patterns"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    policy_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("policies.id", ondelete="CASCADE"),
        nullable=False,
    )
    incident_type: Mapped[str] = mapped_column(String(100), nullable=False)
    component_type: Mapped[str] = mapped_column(String(100), nullable=False)

    # Relationships
    policy: Mapped[Policy] = relationship("Policy", back_populates="incident_patterns")

    __table_args__ = (
        Index("idx_incident_patterns_policy", "policy_id", "incident_type"),
    )


class Equipment(Base):
    __tablename__ = "equipment"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    claim_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("claims.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    equipment_id_qr: Mapped[str] = mapped_column(String(255), nullable=False)
    manufacturer: Mapped[str] = mapped_column(String(255), nullable=False)
    model: Mapped[str] = mapped_column(String(255), nullable=False)
    year: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    cad_ref_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    cad_match_status: Mapped[CadMatch] = mapped_column(
        Enum(CadMatch, name="cad_match"),
        nullable=False,
        server_default="not_available",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    claim: Mapped[Claim] = relationship("Claim", back_populates="equipment")


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    claim_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("claims.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    # All sections nullable — filled progressively through UC-02 to UC-05
    section_a: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    section_b: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    section_c: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    section_d: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    section_e: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    section_f: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    section_g: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    claim: Mapped[Claim] = relationship("Claim", back_populates="report")


class DamageFinding(Base):
    __tablename__ = "damage_findings"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    claim_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("claims.id", ondelete="CASCADE"),
        nullable=False,
    )
    component_id: Mapped[str] = mapped_column(String(100), nullable=False)
    component_type: Mapped[str] = mapped_column(String(100), nullable=False)
    deviation_type: Mapped[str] = mapped_column(String(100), nullable=False)
    measurement: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    severity: Mapped[DamageSeverity] = mapped_column(
        Enum(DamageSeverity, name="damage_severity"), nullable=False
    )
    # {x, y, z} spatial coordinates for UC-07 flag rendering
    spatial_position: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    covered: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    policy_clause: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    claim: Mapped[Claim] = relationship("Claim", back_populates="damage_findings")

    __table_args__ = (
        Index("idx_damage_findings_claim", "claim_id", "severity"),
    )


class Evidence(Base):
    __tablename__ = "evidence"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    claim_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("claims.id", ondelete="CASCADE"),
        nullable=False,
    )
    type: Mapped[EvidenceType] = mapped_column(
        Enum(EvidenceType, name="evidence_type"), nullable=False
    )
    storage_url: Mapped[str] = mapped_column(Text, nullable=False)
    gps_lat: Mapped[Decimal] = mapped_column(Numeric(10, 8), nullable=False)
    gps_lng: Mapped[Decimal] = mapped_column(Numeric(11, 8), nullable=False)
    gps_accuracy: Mapped[Decimal | None] = mapped_column(Numeric(8, 2), nullable=True)
    # Device timestamp — not server time (immutability guarantee)
    captured_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    device_id: Mapped[str] = mapped_column(String(255), nullable=False)
    consent_flag: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    claim: Mapped[Claim] = relationship("Claim", back_populates="evidence")

    __table_args__ = (
        Index("idx_evidence_claim", "claim_id", "type"),
    )


class GsJob(Base):
    __tablename__ = "gs_jobs"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    claim_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("claims.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    status: Mapped[GsJobStatus] = mapped_column(
        Enum(GsJobStatus, name="gs_job_status"),
        nullable=False,
        server_default="pending",
    )
    runpod_job_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    splat_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    claim: Mapped[Claim] = relationship("Claim", back_populates="gs_job")

    __table_args__ = (
        Index("idx_gs_jobs_claim", "claim_id"),
    )
