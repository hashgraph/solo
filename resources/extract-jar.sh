#!/bin/bash
# Extract a jar file to a destination directory
# Usage: ./extract.sh <jarFile> <destDir>

if [ -z "${1}" ]; then
    echo "jarFile arg is required";
    exit 1
fi

if [ -z "${2}" ]; then
    echo "destDir arg is required";
    exit 1
fi

cd "${2}" && jar xvf "${1}"
