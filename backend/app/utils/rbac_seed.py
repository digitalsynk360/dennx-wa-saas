"""
System role + permission seed data.

Roles map directly to the reference UI:
  - Admin   : full access in assigned projects (Sub Admin "Admin" option)
  - Manager : can manage chats, campaigns, templates (Sub Admin "Manager" option)
  - Agent   : inbox-only access (handles chats, cannot manage settings/campaigns)

`ensure_rbac_seed` is idempotent — safe to call on every startup.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.identity import Permission, Role

PERMISSIONS: list[tuple[str, str]] = [
    ("workspace.manage", "Manage workspace settings"),
    ("members.manage", "Invite, edit, remove team members"),
    ("contacts.read", "View contacts"),
    ("contacts.write", "Create, edit, delete, import/export contacts"),
    ("conversations.read", "View conversations and messages"),
    ("conversations.write", "Send messages, resolve/intervene in conversations"),
    ("campaigns.read", "View campaigns"),
    ("campaigns.write", "Create, edit, schedule campaigns"),
    ("templates.read", "View message templates"),
    ("templates.write", "Create, edit, submit templates"),
    ("chatbot.manage", "Manage chatbot rules and flows"),
    ("analytics.read", "View analytics and reports"),
    ("billing.manage", "View and manage billing/subscription"),
]

ROLES: dict[str, list[str]] = {
    "Admin": [code for code, _ in PERMISSIONS],
    "Manager": [
        "contacts.read",
        "contacts.write",
        "conversations.read",
        "conversations.write",
        "campaigns.read",
        "campaigns.write",
        "templates.read",
        "templates.write",
        "chatbot.manage",
        "analytics.read",
    ],
    "Agent": [
        "contacts.read",
        "conversations.read",
        "conversations.write",
    ],
}


async def ensure_rbac_seed(db: AsyncSession) -> None:
    # Permissions
    existing_perms = (await db.execute(select(Permission))).scalars().all()
    perms_by_code = {p.code: p for p in existing_perms}

    for code, description in PERMISSIONS:
        if code not in perms_by_code:
            perm = Permission(code=code, description=description)
            db.add(perm)
            perms_by_code[code] = perm

    await db.flush()

    # Roles + preload permissions
    existing_roles = (
        await db.execute(
            select(Role).options(selectinload(Role.permissions))
        )
    ).scalars().all()

    roles_by_name = {r.name: r for r in existing_roles}

    for role_name, perm_codes in ROLES.items():
        role = roles_by_name.get(role_name)

        if role is None:
            role = Role(
                name=role_name,
                description=f"{role_name} role",
                is_system=True,
            )

            # IMPORTANT:
            # Prevent async lazy-loading on brand new roles
            role.permissions = []

            db.add(role)
            await db.flush()

            roles_by_name[role_name] = role

        # Existing permissions already attached
        current_codes = {p.code for p in role.permissions}

        for code in perm_codes:
            if code not in current_codes:
                role.permissions.append(perms_by_code[code])

    await db.commit()


def default_role_name() -> str:
    """Role assigned to the user who creates a workspace (signup)."""
    return "Admin"
