from app.models.audit_log import AuditLog

from fastapi.encoders import jsonable_encoder


def log_action(
    db,
    shop_id: int,
    module: str,
    action: str,
    record_id,
    old=None,
    new=None,
    user_id: int | None = None,
    commit: bool = True,
):
    log = AuditLog(
        shop_id=shop_id,
        module_name=module,
        action_type=action,
        record_id=str(record_id),
        old_values=(jsonable_encoder(old) if old is not None else None),
        new_values=(jsonable_encoder(new) if new is not None else None),
        created_by=user_id
    )
    db.add(log)
    if commit:
        db.commit()
    return log
