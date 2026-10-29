# containerd's default AppArmor profile for containers (k3s v1.36.5 ships containerd v2.3.4,
# contrib/apparmor/template.go), plus two rules for the stacked label.
#
# Why: on Ubuntu 26.04 (kernel.apparmor_restrict_unprivileged_unconfined=1) container processes
# get the stacked label "cri-containerd.apparmor.d//&unconfined", and the stock profile only allows
# signals/ptrace to the exact name. Postgres then cannot signal its own processes, uvicorn cannot
# stop its workers, Go programs lose SIGURG (containerd/containerd#14485).
#
# How it is used: AppArmor loads every file in /etc/apparmor.d at boot, before k3s starts, and
# containerd does not load its own profile when one with this name is already loaded.
#
# Install on the server (once; again only if this file changes), from the repo root on the Mac:
#   ssh oracle 'sudo tee /etc/apparmor.d/cri-containerd.apparmor.d >/dev/null' < deploy/host/cri-containerd.apparmor.d
#   ssh oracle 'sudo apparmor_parser -r /etc/apparmor.d/cri-containerd.apparmor.d'
#
# Remove (file on the server, then reboot) once the k3s release we run ships containerd's fix.
# When upgrading k3s, compare with that containerd version's template.go.

abi <abi/3.0>,

#include <tunables/global>

profile cri-containerd.apparmor.d flags=(attach_disconnected,mediate_deleted) {
  #include <abstractions/base>

  network,
  capability,
  file,
  umount,
  # Host (privileged) processes may send signals to container processes.
  signal (receive) peer=unconfined,
  # runc may send signals to container processes.
  signal (receive) peer=runc,
  # crun may send signals to container processes.
  signal (receive) peer=crun,
  # Container processes may send signals amongst themselves.
  signal (send,receive) peer=cri-containerd.apparmor.d,
  # The same, for the stacked label (the fix).
  signal (send,receive) peer=cri-containerd.apparmor.d//&unconfined,

  deny @{PROC}/* w,   # deny write for all files directly in /proc (not in a subdir)
  # deny write to files not in /proc/<number>/** or /proc/sys/**
  deny @{PROC}/{[^1-9/],[^1-9/][^0-9/],[^1-9s/][^0-9y/][^0-9s/],[^1-9/][^0-9/][^0-9/][^0-9/]*}/** w,
  deny @{PROC}/sys/[^k]** w,  # deny /proc/sys except /proc/sys/k* (effectively /proc/sys/kernel)
  deny @{PROC}/sys/kernel/{?,??,[^s][^h][^m]**} w,  # deny everything except shm* in /proc/sys/kernel/
  deny @{PROC}/sysrq-trigger rwklx,
  deny @{PROC}/kcore rwklx,

  deny mount,

  deny /sys/[^f]*/** wklx,
  deny /sys/f[^s]*/** wklx,
  deny /sys/fs/[^c]*/** wklx,
  deny /sys/fs/c[^g]*/** wklx,
  deny /sys/fs/cg[^r]*/** wklx,
  deny /sys/firmware/** rwklx,
  deny /sys/devices/virtual/powercap/** rwklx,
  deny /sys/kernel/security/** rwklx,

  # allow processes within the container to trace each other,
  # provided all other LSM and yama setting allow it.
  ptrace (trace,tracedby,read,readby) peer=cri-containerd.apparmor.d,
  # The same, for the stacked label (the fix).
  ptrace (trace,tracedby,read,readby) peer=cri-containerd.apparmor.d//&unconfined,
}