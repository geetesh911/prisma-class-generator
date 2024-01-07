export const INDEX_TEMPLATE = `#!{IMPORTS}

export namespace #!{NAMESPACE_NAME} {
#!{RE_EXPORT_CLASSES}

	export const extraModels = [
		#!{CLASSES}
	]
}`;
