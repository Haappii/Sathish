#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  exec sudo -E bash "$0" "$@"
fi

SWAPFILE_PATH="${SWAPFILE_PATH:-/swapfile}"
SWAPFILE_SIZE_GB="${SWAPFILE_SIZE_GB:-4}"
NODE_HEAP_MB="${NODE_HEAP_MB:-2048}"
PROFILE_ENV_PATH="${PROFILE_ENV_PATH:-/etc/profile.d/haappii_node_heap.sh}"
SYSCTL_CONF_PATH="${SYSCTL_CONF_PATH:-/etc/sysctl.d/99-haappii-memory.conf}"
BACKEND_SERVICE="${BACKEND_SERVICE:-pos-backend}"
RESTART_SERVICES="${RESTART_SERVICES:-1}"

print_memory_snapshot() {
  echo "==> Memory snapshot"
  free -h || true
  echo
  echo "==> Active swap"
  swapon --show || true
  echo
}

ensure_swap() {
  echo "==> Ensuring swap space"
  if ! swapon --show | grep -q "${SWAPFILE_PATH}"; then
    if [[ ! -f "${SWAPFILE_PATH}" ]]; then
      echo "Creating ${SWAPFILE_SIZE_GB} GB swapfile at ${SWAPFILE_PATH}"
      fallocate -l "${SWAPFILE_SIZE_GB}G" "${SWAPFILE_PATH}"
      chmod 600 "${SWAPFILE_PATH}"
      mkswap "${SWAPFILE_PATH}"
    fi
    swapon "${SWAPFILE_PATH}"
  else
    echo "Swap already active at ${SWAPFILE_PATH}"
  fi

  if ! grep -qF "${SWAPFILE_PATH} none swap sw 0 0" /etc/fstab; then
    echo "${SWAPFILE_PATH} none swap sw 0 0" >> /etc/fstab
  fi
}

configure_kernel_memory() {
  echo "==> Writing memory tuning config"
  cat > "${SYSCTL_CONF_PATH}" <<EOF
vm.swappiness=10
vm.vfs_cache_pressure=50
EOF
  sysctl --system >/dev/null
}

persist_node_heap() {
  echo "==> Persisting Node heap limit"
  cat > "${PROFILE_ENV_PATH}" <<EOF
export NODE_OPTIONS=--max-old-space-size=${NODE_HEAP_MB}
EOF
  chmod 644 "${PROFILE_ENV_PATH}"
}

drop_linux_caches() {
  echo "==> Dropping Linux file caches"
  sync
  if [[ -w /proc/sys/vm/drop_caches ]]; then
    echo 3 > /proc/sys/vm/drop_caches
  fi
}

restart_common_services() {
  if [[ "${RESTART_SERVICES}" != "1" ]]; then
    return
  fi

  echo "==> Restarting common services"
  if systemctl list-unit-files | grep -q "^${BACKEND_SERVICE}\.service"; then
    systemctl restart "${BACKEND_SERVICE}" || true
  fi
  if systemctl list-unit-files | grep -q "^nginx\.service"; then
    systemctl restart nginx || true
  fi
}

run_optional_command() {
  if [[ "$#" -eq 0 ]]; then
    return
  fi

  echo "==> Running requested command with NODE_OPTIONS=${NODE_HEAP_MB} MB"
  export NODE_OPTIONS="--max-old-space-size=${NODE_HEAP_MB}"
  "$@"
}

echo "==> Haappii heap/OOM helper"
print_memory_snapshot
ensure_swap
configure_kernel_memory
persist_node_heap
drop_linux_caches
restart_common_services
print_memory_snapshot

echo "==> Done"
echo "New login shells will automatically use NODE_OPTIONS=--max-old-space-size=${NODE_HEAP_MB}"
echo "To use it immediately in the current shell, run:"
echo "source ${PROFILE_ENV_PATH}"

run_optional_command "$@"
