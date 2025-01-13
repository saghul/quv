#!/bin/bash
#Run from the root path of the repo.
typedoc --tsconfig types/tsconfig.doc.json
doxygen ./dist/configs/Doxyfile
mkdocs build -f ./dist/configs/mkdocs.yml