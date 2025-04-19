install:
	pnpm install
.PHONY: install

update-internal:
	pnpm update "@breeze32/*" --latest
.PHONY: update-internal-packages

publish:
	$(MAKE) push COMMIT=$(COMMIT)
	pnpm version $(VERSION)
	pnpm publish --access public
.PHONY: publish

push:
	git add .
	git commit -m $(COMMIT)
	git push
.PHONY: publish