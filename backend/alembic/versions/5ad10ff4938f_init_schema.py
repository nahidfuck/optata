"""init_schema

Revision ID: 5ad10ff4938f
Revises:
Create Date: 2026-07-12 13:22:16.861798

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import CITEXT, UUID

revision: str = '5ad10ff4938f'
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS citext")

    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("email", CITEXT(), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("username", CITEXT(), nullable=False),
        sa.Column("username_changed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("display_name", sa.String(40), nullable=True),
        sa.Column("bio", sa.String(160), nullable=True),
        sa.Column("avatar_url", sa.Text(), nullable=True),
        sa.Column("avatar_path", sa.Text(), nullable=True),
        sa.Column("is_discoverable", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("email", name="uq_users_email"),
        sa.UniqueConstraint("username", name="uq_users_username"),
    )

    op.create_table(
        "items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(80), nullable=False),
        sa.Column("image_url", sa.Text(), nullable=False),
        sa.Column("image_path", sa.Text(), nullable=False),
        sa.Column("accent_color", sa.CHAR(7), nullable=False, server_default=sa.text("'#D6D6D1'")),
        sa.Column("link", sa.String(2048), nullable=True),
        sa.Column("price", sa.Numeric(12, 2), nullable=True),
        sa.Column("currency", sa.CHAR(3), nullable=True),
        sa.Column("note", sa.String(280), nullable=True),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("view_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("(price IS NULL) = (currency IS NULL)", name="ck_items_price_currency_together"),
        sa.CheckConstraint("price IS NULL OR price >= 0", name="ck_items_price_nonnegative"),
    )
    op.create_index("ix_items_user_order", "items", ["user_id", "order_index"])

    op.create_table(
        "reservations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("item_id", UUID(as_uuid=True), sa.ForeignKey("items.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reserver_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("item_id", name="uq_reservations_item"),
    )
    op.create_index("ix_reservations_reserver", "reservations", ["reserver_id"])

    op.create_table(
        "refresh_tokens",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("token_hash", name="uq_refresh_tokens_token_hash"),
    )
    op.create_index("ix_refresh_user", "refresh_tokens", ["user_id"])

    op.create_table(
        "password_reset_tokens",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("used_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("token_hash", name="uq_password_reset_tokens_token_hash"),
    )

    op.create_table(
        "item_view_sessions",
        sa.Column("item_id", UUID(as_uuid=True), sa.ForeignKey("items.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("session_hash", sa.Text(), primary_key=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
    )


def downgrade() -> None:
    op.drop_table("item_view_sessions")
    op.drop_table("password_reset_tokens")
    op.drop_table("refresh_tokens")
    op.drop_table("reservations")
    op.drop_table("items")
    op.drop_table("users")
