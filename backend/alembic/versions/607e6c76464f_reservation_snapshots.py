"""reservation_snapshots

A SET NULL tombstone alone carries zero information — no join target
means no title, no owner. Snapshot the item's title and the owner's
username at reserve time; read the snapshots only when item_id IS NULL.
The snapshot shows the promise as it was made, not a stale join.

Revision ID: 607e6c76464f
Revises: c5ea05a99ba6
Create Date: 2026-07-12 20:42:01.635237

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import CITEXT

revision: str = '607e6c76464f'
down_revision: str | None = 'c5ea05a99ba6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # reservations is empty in every environment (no production data),
    # so NOT NULL without a default is safe here.
    op.add_column("reservations", sa.Column("item_title_snapshot", sa.String(80), nullable=False))
    op.add_column("reservations", sa.Column("owner_username_snapshot", CITEXT(), nullable=False))


def downgrade() -> None:
    op.drop_column("reservations", "owner_username_snapshot")
    op.drop_column("reservations", "item_title_snapshot")
