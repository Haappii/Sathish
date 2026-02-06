from app.models.audit_log import AuditLog

def log_action(db, module, action, record_id, old=None, new=None, user_id=None):
    log = AuditLog(
        module_name=module,
        action_type=action,
        record_id=str(record_id),
        old_values=old,
        new_values=new,
        created_by=user_id
    )
    db.add(log)
    db.commit()
