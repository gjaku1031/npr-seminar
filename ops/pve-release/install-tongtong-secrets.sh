#!/usr/bin/env bash
# 통통통 원천 로그인 ID·비밀번호를 /etc/npr-seminar/secrets 에 설치. 동기화 활성화는 하지 않음
# 실행: pve-release 에서 root 로 실행하고 표준 입력에 ID, 비밀번호를 한 줄씩 넣음(터미널이면 입력을 화면에 표시하지 않음)
# 종료 코드: 0 설치 완료, 1 pve-release root 가 아니거나 입력이 비었음
set -Eeuo pipefail

# pve-release root 에서만 실행
if [[ ${EUID} -ne 0 || $(hostname -s) != "pve-release" ]]; then
  echo "refusing to install secrets outside pve-release as root" >&2
  exit 1
fi

# 터미널 입력이면 비밀번호가 보이지 않게 echo 를 끄고 종료 시 되돌림
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

# 두 값을 표준 입력에서 읽음
IFS= read -r tongtong_username
IFS= read -r tongtong_password
if [[ -z ${tongtong_username} || -z ${tongtong_password} ]]; then
  echo "both TongTongTong secrets are required" >&2
  exit 1
fi

# 같은 디렉터리 임시 파일에 쓴 뒤 권한을 맞추고 이름을 바꿔 원자적으로 교체
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
