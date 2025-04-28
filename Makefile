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

check:
	pnpm exec biome lint
	pnpm exec npmPkgJsonLint -c ./.npmpackagejsonlintrc.json ./**/package.json
.PHONY: check

publish-beta:
	-$(MAKE) push COMMIT=$(COMMIT)
	pnpm version prerelease --preid=beta
	pnpm publish --access public --tag beta
.PHONY: publish-beta

install-beta:
	pnpm install $(PACKAGE)@beta
.PHONY: install-beta

push:
	git add .
	git commit -m $(COMMIT)
	git push
.PHONY: publish