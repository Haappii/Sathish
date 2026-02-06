def scope_by_branch(query, user):
    if user.role_name == "Admin":
        return query
    return query.filter_by(branch_id=user.branch_id)
