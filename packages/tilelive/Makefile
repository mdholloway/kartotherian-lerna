#
# Run all tests
#

expresso = ./node_modules/expresso/bin/expresso
docco = ./node_modules/docco/bin/docco

ifndef only
test:
	$(expresso) -I lib test/*.test.js
else
test:
	$(expresso) -I lib test/${only}.test.js
endif

doc:
	$(docco) lib/tilelive/*.js

.PHONY: test
