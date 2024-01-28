export const CLASS_TEMPLATE = `#!{IMPORTS}

#!{DECORATORS}
export class #!{NAME} #!{EXTENDS} {
#!{FIELDS}

#!{MODEL_NAME_GETTER}

#!{TO_OBJECT_METHOD}
}
#!{EXTRA}
`;
