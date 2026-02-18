export const getPlatformToken = () => localStorage.getItem("platform_token");

export const setPlatformToken = (token) => {
  if (!token) return;
  localStorage.setItem("platform_token", token);
};

export const clearPlatformToken = () => {
  localStorage.removeItem("platform_token");
};

