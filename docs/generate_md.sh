#!/usr/bin/env bash

# find javascript files
FIND_CMD=$(find ../src -name "*js")

# save result to array
FILES=($FIND_CMD)

mkdir -p content/Classes

for i in "${FILES[@]}"
do
# 	echo $i
	# extract base file name from path, remove path and extension
	BASENAME=$(basename $i .js)
	jsdoc2md -c jsdoc.conf.json $i > ./content/Classes/$BASENAME.md
done
