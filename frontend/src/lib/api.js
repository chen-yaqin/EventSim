const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8787";

export async function fetchPlan(payload) {
  const response = await fetch(`${BASE_URL}/api/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return parseJson(response);
}

export async function fetchExpand(payload) {
  const response = await fetch(`${BASE_URL}/api/expand`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return parseJson(response);
}

export async function fetchBranch(payload) {
  const response = await fetch(`${BASE_URL}/api/branch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return parseJson(response);
}

export async function fetchChat(payload) {
  const response = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return parseJson(response);
}

export async function fetchDemo(id) {
  const response = await fetch(`${BASE_URL}/api/demo/${id}`);
  return parseJson(response);
}

async function parseJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || data.error || "Request failed");
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}
