from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime


class SystemConfig(SQLModel, table=True):
    __tablename__ = "system_config"
    key: str = Field(primary_key=True)
    value: Optional[str] = None
    updated_at: Optional[datetime] = None


class Entity(SQLModel, table=True):
    __tablename__ = "entities"
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    industry: Optional[str] = None
    description: Optional[str] = None
    cobit_scope: Optional[str] = None  # JSON: ['PO','AI','DS','ME']
    created_at: datetime = Field(default_factory=datetime.utcnow)
    status: str = Field(default="active")


class Document(SQLModel, table=True):
    __tablename__ = "documents"
    id: Optional[int] = Field(default=None, primary_key=True)
    entity_id: int = Field(foreign_key="entities.id")
    filename: str
    original_name: Optional[str] = None
    doc_type: Optional[str] = None
    file_hash: Optional[str] = None
    status: str = Field(default="pending")
    page_count: Optional[int] = None
    extracted_entities: Optional[str] = None  # JSON
    classification_status: str = Field(default="pending")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class DocumentFragment(SQLModel, table=True):
    __tablename__ = "document_fragments"
    id: Optional[int] = Field(default=None, primary_key=True)
    document_id: int = Field(foreign_key="documents.id")
    entity_id: int = Field(foreign_key="entities.id")
    content: str
    fragment_type: Optional[str] = None
    cobit_hint: Optional[str] = None
    confidence: Optional[float] = None
    page_ref: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class CobitCoverage(SQLModel, table=True):
    __tablename__ = "cobit_coverage"
    id: Optional[int] = Field(default=None, primary_key=True)
    entity_id: int = Field(foreign_key="entities.id")
    process_id: str
    domain: str
    status: str = Field(default="no_data")
    evidence_count: int = Field(default=0)
    gap_count: int = Field(default=0)
    last_calculated: Optional[datetime] = None
    fragments_linked: Optional[str] = None  # JSON list of fragment ids
    ai_analysis: Optional[str] = None  # JSON from Gemini
    ai_analyzed_at: Optional[datetime] = None


class Finding(SQLModel, table=True):
    __tablename__ = "findings"
    id: Optional[int] = Field(default=None, primary_key=True)
    entity_id: int = Field(foreign_key="entities.id")
    process_id: str
    title: str
    description: Optional[str] = None
    origin: str = Field(default="manual")  # auto_rule | ai_suggested | manual
    severity: Optional[str] = None  # critica, alta, media, baja
    status: str = Field(default="preliminary")  # preliminary, validated, discarded, included
    evidence_fragments: Optional[str] = None  # JSON list of fragment ids
    auditor_notes: Optional[str] = None
    formal_observation: Optional[str] = None  # JSON from Gemini
    probability: Optional[int] = None         # 1-5
    impact: Optional[int] = None              # 1-5
    gemini_tokens_used: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None


class RiskChain(SQLModel, table=True):
    __tablename__ = "risk_chains"
    id: Optional[int] = Field(default=None, primary_key=True)
    entity_id: int = Field(foreign_key="entities.id")
    chain_id: str
    chain_path: str  # JSON list
    description: Optional[str] = None
    severity: Optional[str] = None
    auto_generated: int = Field(default=1)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Inconsistency(SQLModel, table=True):
    __tablename__ = "inconsistencies"
    id: Optional[int] = Field(default=None, primary_key=True)
    entity_id: int = Field(foreign_key="entities.id")
    doc_a_id: int
    doc_b_id: int
    doc_a_name: Optional[str] = None
    doc_b_name: Optional[str] = None
    fragment_a_id: Optional[int] = None
    fragment_b_id: Optional[int] = None
    fragment_a_text: str
    fragment_b_text: str
    inc_type: str  # date | deadline | responsible | figure | ambiguous
    severity: str = Field(default="media")  # alta | media | baja
    description: str
    status: str = Field(default="detected")  # detected | analyzed | dismissed | promoted
    gemini_analysis: Optional[str] = None
    gemini_description: Optional[str] = None
    formal_description: Optional[str] = None
    finding_id: Optional[int] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class GeminiUsage(SQLModel, table=True):
    __tablename__ = "gemini_usage"
    id: Optional[int] = Field(default=None, primary_key=True)
    entity_id: Optional[int] = None
    operation: Optional[str] = None
    model: Optional[str] = None
    tokens_in: Optional[int] = None
    tokens_out: Optional[int] = None
    cost_units: int = Field(default=1)
    created_at: datetime = Field(default_factory=datetime.utcnow)
