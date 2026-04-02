def scope_by_branch(query, user):
    role = str(getattr(user, "role_name", "") or "").strip().lower()
    if role == "admin":
        return query
    return query.filter_by(branch_id=user.branch_id)
