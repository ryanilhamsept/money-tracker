const GOOGLE_SHEET_API_URL =
  "https://script.google.com/macros/s/AKfycbz3Qd9HST7mXAY-bsLuGyqBaVKMMXCjDqXhRPDpMEecKFCiw78lALg3xwhkIS-woWMSWQ/exec";

const fetchJson = async (url) => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Google Sheets request failed (${response.status}).`);
  }

  const data = await response.json();

  if (data?.success === false) {
    throw new Error(data.error || "Google Sheets rejected the request.");
  }

  return data;
};

export const getAccounts = async () => {
  return fetchJson(`${GOOGLE_SHEET_API_URL}?type=accounts`);
};

export const getTransactions = async () => {
  const data = await fetchJson(GOOGLE_SHEET_API_URL);
  return Array.isArray(data) ? data : data.rows || [];
};
