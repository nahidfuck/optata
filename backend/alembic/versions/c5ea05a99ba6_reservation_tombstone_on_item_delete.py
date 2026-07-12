"""reservation_tombstone_on_item_delete

Deviation from tech-spec §1, forced by the Stage 2 requirement that a
deleted item must surface as a tombstone in GET /reservations: with
ON DELETE CASCADE the reservation row vanishes and there is nothing left
to render. item_id becomes nullable with ON DELETE SET NULL; a NULL
item_id IS the tombstone. uq_reservations_item still allows at most one
reservation per live item (Postgres unique ignores NULLs).

Revision ID: c5ea05a99ba6
Revises: 5ad10ff4938f
Create Date: 2026-07-12 20:15:42.576454

"""
from collections.abc import Sequence

from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = 'c5ea05a99ba6'
down_revision: str | None = '5ad10ff4938f'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("reservations_item_id_fkey", "reservations", type_="foreignkey")
    op.alter_column("reservations", "item_id", existing_type=UUID(as_uuid=True), nullable=True)
    op.create_foreign_key(
        "reservations_item_id_fkey",
        "reservations",
        "items",
        ["item_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.execute("DELETE FROM reservations WHERE item_id IS NULL")
    op.drop_constraint("reservations_item_id_fkey", "reservations", type_="foreignkey")
    op.alter_column("reservations", "item_id", existing_type=UUID(as_uuid=True), nullable=False)
    op.create_foreign_key(
        "reservations_item_id_fkey",
        "reservations",
        "items",
        ["item_id"],
        ["id"],
        ondelete="CASCADE",
    )
