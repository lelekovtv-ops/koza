#!/bin/zsh

set -u

ROOT_DIR="/Users/macbookbpm/Desktop/KOZA"
PID_FILE="$ROOT_DIR/.next-dev.pid"
PORT_FILE="$ROOT_DIR/.next-dev.port"
LOG_FILE="$ROOT_DIR/.next-dev.log"
HEALTH_PATH="/healthz"
DEFAULT_PORT="3001"
FALLBACK_PORT="3002"
NODE_BIN=""

cd "$ROOT_DIR" || exit 1

resolve_node_bin() {
	if [[ -x "/Users/macbookbpm/.nvm/versions/node/v20.20.1/bin/node" ]]; then
		echo "/Users/macbookbpm/.nvm/versions/node/v20.20.1/bin/node"
		return
	fi

	local nvm_nodes=(/Users/macbookbpm/.nvm/versions/node/*/bin/node(N))
	if (( ${#nvm_nodes[@]} > 0 )); then
		echo "${nvm_nodes[-1]}"
		return
	fi

	echo ""
}

NODE_BIN="$(resolve_node_bin)"

get_saved_port() {
	if [[ -f "$PORT_FILE" ]]; then
		local saved_port
		saved_port="$(<"$PORT_FILE")"
		if [[ -n "$saved_port" ]]; then
			echo "$saved_port"
			return
		fi
	fi

	echo "$DEFAULT_PORT"
}

is_pid_running() {
	local pid="$1"
	[[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

read_pid() {
	[[ -f "$PID_FILE" ]] && /bin/cat "$PID_FILE"
}

write_runtime_files() {
	local pid="$1"
	local port="$2"
	echo "$pid" > "$PID_FILE"
	echo "$port" > "$PORT_FILE"
}

clear_runtime_files() {
	/bin/rm -f "$PID_FILE" "$PORT_FILE"
}

kill_listener_on_port() {
	local port="$1"
	local listener_pids
	listener_pids="$(/usr/sbin/lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null)"

	if [[ -z "$listener_pids" ]]; then
		return 0
	fi

	for pid in ${(f)listener_pids}; do
		/bin/kill "$pid" 2>/dev/null || true
	done

	/bin/sleep 1

	listener_pids="$(/usr/sbin/lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null)"
	if [[ -n "$listener_pids" ]]; then
		for pid in ${(f)listener_pids}; do
			/bin/kill -9 "$pid" 2>/dev/null || true
		done
	fi
}

health_check() {
	local port="$1"
	/usr/bin/curl --connect-timeout 1 --max-time 2 -fsS "http://localhost:${port}${HEALTH_PATH}" >/dev/null 2>&1
}

wait_for_health() {
	local port="$1"
	local attempts=90

	for _ in {1..90}; do
		if health_check "$port"; then
			return 0
		fi
		/bin/sleep 1
	done

	return 1
}

start_on_port() {
	local port="$1"

	if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
		echo "Node binary was not found for PIECE launcher"
		return 1
	fi

	/usr/bin/nohup "$NODE_BIN" ./node_modules/next/dist/bin/next dev -p "$port" > "$LOG_FILE" 2>&1 &
	local pid=$!
	write_runtime_files "$pid" "$port"

	if wait_for_health "$port"; then
		echo "PIECE dev server is running on http://localhost:$port"
		return 0
	fi

	kill "$pid" 2>/dev/null || true
	clear_runtime_files
	echo "Failed to start PIECE dev server on port $port"
	return 1
}

start_server() {
	local current_pid
	current_pid="$(read_pid)"
	local current_port
	current_port="$(get_saved_port)"

	if [[ -n "$current_pid" ]] && is_pid_running "$current_pid" && health_check "$current_port"; then
		echo "PIECE dev server is already healthy on http://localhost:$current_port"
		return 0
	fi

	if health_check "$DEFAULT_PORT"; then
		echo "$DEFAULT_PORT" > "$PORT_FILE"
		echo "PIECE dev server is already healthy on http://localhost:$DEFAULT_PORT"
		return 0
	fi

	clear_runtime_files
	kill_listener_on_port "$DEFAULT_PORT"
	kill_listener_on_port "$FALLBACK_PORT"

	start_on_port "$DEFAULT_PORT" || start_on_port "$FALLBACK_PORT"
}

stop_server() {
	local current_pid
	current_pid="$(read_pid)"

	if [[ -z "$current_pid" ]]; then
		clear_runtime_files
		echo "No managed PIECE dev server PID found"
		return 0
	fi

	if is_pid_running "$current_pid"; then
		kill "$current_pid" 2>/dev/null || true
		for _ in {1..10}; do
			if ! is_pid_running "$current_pid"; then
				break
			fi
			/bin/sleep 1
		done
	fi

	clear_runtime_files
	echo "Managed PIECE dev server stopped"
}

status_server() {
	local current_pid
	current_pid="$(read_pid)"
	local current_port
	current_port="$(get_saved_port)"

	if [[ -n "$current_pid" ]] && is_pid_running "$current_pid" && health_check "$current_port"; then
		echo "healthy:$current_port:$current_pid"
		return 0
	fi

	if health_check "$DEFAULT_PORT"; then
		echo "healthy:$DEFAULT_PORT:external"
		return 0
	fi

	if health_check "$FALLBACK_PORT"; then
		echo "healthy:$FALLBACK_PORT:external"
		return 0
	fi

	echo "down"
	return 1
}

case "${1:-start}" in
	start)
		start_server
		;;
	stop)
		stop_server
		;;
	restart)
		stop_server
		start_server
		;;
	status)
		status_server
		;;
	*)
		echo "Usage: ./start-dev.sh [start|stop|restart|status]"
		exit 1
		;;
esac
