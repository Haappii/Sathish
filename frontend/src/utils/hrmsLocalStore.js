const LS_KEY = "hrms_local_store_v1";

const defaultState = {
  leaves: [],
  documents: [], // {id, employee_id, doc_type, doc_number, name, type, size, data, created_at}
};

const load = () => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...defaultState };
    const parsed = JSON.parse(raw);
    return { ...defaultState, ...parsed };
  } catch {
    return { ...defaultState };
  }
};

const save = (data) => {
  localStorage.setItem(LS_KEY, JSON.stringify(data));
};

export const listLeaves = () => load().leaves;

export const addLeave = (leave) => {
  const state = load();
  state.leaves = [
    {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      status: "PENDING",
      ...leave,
    },
    ...state.leaves,
  ];
  save(state);
  return state.leaves;
};

export const updateLeaveStatus = (id, status) => {
  const state = load();
  state.leaves = state.leaves.map((l) =>
    l.id === id ? { ...l, status } : l
  );
  save(state);
  return state.leaves;
};

export const listDocuments = () => load().documents;

export const addDocuments = (docs) => {
  const state = load();
  state.documents = [
    ...docs.map((d) => ({
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      ...d,
    })),
    ...state.documents,
  ];
  save(state);
  return state.documents;
};

export const removeDocument = (id) => {
  const state = load();
  state.documents = state.documents.filter((d) => d.id !== id);
  save(state);
  return state.documents;
};

// Employee-scoped helpers
export const listEmployeeDocs = (employeeId) =>
  load().documents.filter((d) => String(d.employee_id) === String(employeeId));

export const addEmployeeDoc = (employeeId, doc) => {
  const state = load();
  state.documents = [
    {
      id: crypto.randomUUID(),
      employee_id: employeeId,
      created_at: new Date().toISOString(),
      ...doc,
    },
    ...state.documents,
  ];
  save(state);
  return listEmployeeDocs(employeeId);
};

export const removeEmployeeDoc = (employeeId, id) => {
  const state = load();
  state.documents = state.documents.filter((d) => d.id !== id);
  save(state);
  return listEmployeeDocs(employeeId);
};
