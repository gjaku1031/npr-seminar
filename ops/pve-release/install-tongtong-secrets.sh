#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -ne 0 || $(hostname -s) != "pve-release" ]]; then
  echo "refusing to install secrets outside pve-release as root" >&2
  exit 1
fi

terminal_echo_disabled=false
if [[ -t 0 ]]; then
  stty -echo
  terminal_echo_disabled=true
fi
restore_terminal() {
  if [[ ${terminal_echo_disabled} == true ]]; then
    stty echo
  fi
}
trap restore_terminal EXIT

IFS= read -r tongtong_username
IFS= read -r tongtong_password
if [[ -z ${tongtong_username} || -z ${tongtong_password} ]]; then
  echo "both TongTongTong secrets are required" >&2
  exit 1
fi

secret_dir=/etc/npr-seminar/secrets
install -d -o root -g npr -m 0750 "${secret_dir}"

username_tmp=$(mktemp "${secret_dir}/.tongtong-username.XXXXXX")
password_tmp=$(mktemp "${secret_dir}/.tongtong-password.XXXXXX")
cleanup() {
  rm -f -- "${username_tmp}" "${password_tmp}"
}
trap 'cleanup; restore_terminal' EXIT

printf '%s' "${tongtong_username}" > "${username_tmp}"
printf '%s' "${tongtong_password}" > "${password_tmp}"
chown root:npr "${username_tmp}" "${password_tmp}"
chmod 0640 "${username_tmp}" "${password_tmp}"
mv "${username_tmp}" "${secret_dir}/tongtong-username"
mv "${password_tmp}" "${secret_dir}/tongtong-password"

unset tongtong_username tongtong_password
echo "TongTongTong secret references installed; synchronization remains disabled"
