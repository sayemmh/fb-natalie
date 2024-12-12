#!/bin/bash

# Find Node.js processes
node_pids=$(pgrep node)

if [ -z "$node_pids" ]; then
    echo "No Node.js processes found."
    exit 0
fi

echo "Found Node.js processes with PIDs: $node_pids"
echo "Killing Node.js processes..."

# Kill each Node.js process
for pid in $node_pids; do
    kill $pid
    echo "Killed process with PID $pid"
done

echo "Checking if processes are still running..."
sleep 2

# Check if any Node.js processes are still running
remaining_pids=$(pgrep node)

if [ -n "$remaining_pids" ]; then
    echo "Some processes are still running. Using force kill..."
    for pid in $remaining_pids; do
        kill -9 $pid
        echo "Force killed process with PID $pid"
    done
else
    echo "All Node.js processes have been terminated."
fi

# Check if port 5004 is still in use
if netstat -tuln | grep :5004 > /dev/null; then
    echo "Port 5004 is still in use. Killing process on port 5004..."
    fuser -k 5004/tcp
    echo "Killed process on port 5004"
else
    echo "Port 5004 is free."
fi