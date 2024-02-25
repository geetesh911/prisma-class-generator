import { DMMF } from '@prisma/generator-helper';
import { ClassComponent } from './components/class.component';
import { DecoratorComponent } from './components/decorator.component';
import { FieldComponent } from './components/field.component';
import { PrismaClassGeneratorConfig } from './generator';
import {
	arrayify,
	capitalizeFirst,
	uniquify,
	wrapArrowFunction,
	wrapQuote,
} from './util';
import { ExtraFieldProps } from './interfaces/extra-field-props.interface';
import { ClassMetadata } from './interfaces/class-metadata.interface';

/** BigInt, Boolean, Bytes, DateTime, Decimal, Float, Int, JSON, String, $ModelName */
type DefaultPrismaFieldType =
	| 'BigInt'
	| 'Boolean'
	| 'Bytes'
	| 'DateTime'
	| 'Decimal'
	| 'Float'
	| 'Int'
	| 'Json'
	| 'String';

const primitiveMapType: Record<DefaultPrismaFieldType, string> = {
	Int: 'number',
	String: 'string',
	DateTime: 'Date',
	Boolean: 'boolean',
	Json: 'object',
	BigInt: 'BigInt',
	Float: 'number',
	Decimal: 'number',
	Bytes: 'Buffer',
} as const;

export type PrimitiveMapTypeKeys = keyof typeof primitiveMapType;
export type PrimitiveMapTypeValues =
	typeof primitiveMapType[PrimitiveMapTypeKeys];

export interface SwaggerDecoratorParams {
	isArray?: boolean;
	type?: string;
	enum?: string;
	enumName?: string;
}

export interface ConvertModelInput {
	model: DMMF.Model;
	extractRelationFields?: boolean;
	postfix?: string;
	useGraphQL?: boolean;
	createAggregateRoot?: boolean;
	addToObjectMethodToAggregateRoot?: boolean;
	separateRelationFields?: boolean;
	importSelfRelations?: boolean;
	metadata?: ClassMetadata;
	addModelNameGetter?: boolean;
	enableDeepRelations?: true;
}

export class PrismaConvertor {
	static instance: PrismaConvertor;
	private _config: PrismaClassGeneratorConfig;
	private _dmmf: DMMF.Document;

	public get dmmf() {
		return this._dmmf;
	}

	public set dmmf(value) {
		this._dmmf = value;
	}

	public get config() {
		return this._config;
	}

	public set config(value) {
		this._config = value;
	}

	static getInstance() {
		if (PrismaConvertor.instance) {
			return PrismaConvertor.instance;
		}
		PrismaConvertor.instance = new PrismaConvertor();
		return PrismaConvertor.instance;
	}

	getPrimitiveMapTypeFromDMMF = (
		dmmfField: DMMF.Field,
	): PrimitiveMapTypeValues => {
		if (typeof dmmfField.type !== 'string') {
			return 'unknown';
		}
		return primitiveMapType[dmmfField.type];
	};

	extractTypeGraphQLDecoratorFromField = (
		dmmfField: DMMF.Field,
	): DecoratorComponent => {
		const options: SwaggerDecoratorParams = {};
		const decorator = new DecoratorComponent({
			name: 'Field',
			importFrom: '@nestjs/graphql',
		});
		if (dmmfField.isId) {
			decorator.params.push(`() => ID`);
			return decorator;
		}
		const isJson = dmmfField.type === 'Json';

		if (isJson) {
			decorator.params.push(`() => GraphQLJSON`);
		}

		let type = this.getPrimitiveMapTypeFromDMMF(dmmfField);

		if (type && type !== 'any' && !isJson) {
			let grahQLType = capitalizeFirst(type);
			if (grahQLType === 'Number') {
				grahQLType = 'Int';
			}
			if (dmmfField.isList) {
				grahQLType = `[${grahQLType}]`;
			}
			decorator.params.push(`() => ${grahQLType}`);
		}

		if (dmmfField.relationName) {
			let type = dmmfField.type;
			if (dmmfField.isList) {
				type = `[${type}]`;
			}
			decorator.params.push(`() => ${type}`);
		}

		if (dmmfField.kind === 'enum') {
			let type = dmmfField.type;
			if (dmmfField.isList) {
				type = `[${type}]`;
			}
			decorator.params.push(`() => ${type}`);
		}

		if (dmmfField.isRequired === false) {
			decorator.params.push(`{nullable : true}`);
		}

		return decorator;
	};

	extractSwaggerDecoratorFromField = (
		dmmfField: DMMF.Field,
	): DecoratorComponent => {
		const options: SwaggerDecoratorParams = {};
		const name =
			dmmfField.isRequired === true
				? 'ApiProperty'
				: 'ApiPropertyOptional';
		const decorator = new DecoratorComponent({
			name: name,
			importFrom: '@nestjs/swagger',
		});

		if (dmmfField.isList) {
			options.isArray = true;
		}

		let type = this.getPrimitiveMapTypeFromDMMF(dmmfField);
		if (type && type !== 'any') {
			options.type = capitalizeFirst(type);
			decorator.params.push(options);
			return decorator;
		}
		type = dmmfField.type.toString();

		if (dmmfField.relationName) {
			options.type = wrapArrowFunction(dmmfField);
			decorator.params.push(options);
			return decorator;
		}

		if (dmmfField.kind === 'enum') {
			options.enum = dmmfField.type;
			options.enumName = wrapQuote(dmmfField);
		}

		decorator.params.push(options);
		return decorator;
	};

	getClass = (input: ConvertModelInput): ClassComponent => {
		/** options */
		const options = {
			extractRelationFields: null,
			useGraphQL: false,
			createAggregateRoot: false,
			separateRelationFields: false,
			importSelfRelations: false,
			addToObjectMethodToAggregateRoot: false,
			addModelNameGetter: false,
			enableDeepRelations: false,
			...input,
		};
		const {
			model,
			extractRelationFields = null,
			postfix,
			useGraphQL,
			createAggregateRoot,
			separateRelationFields,
			importSelfRelations,
			addToObjectMethodToAggregateRoot,
			addModelNameGetter,
			metadata,
			enableDeepRelations,
		} = options;

		/** set class name */
		let className = model.name;
		if (postfix) {
			className += postfix;
		}
		const classComponent = new ClassComponent({
			name: className,
			createAggregateRoot,
			addToObjectMethodToAggregateRoot,
		});

		/** relation & enums */
		const relationTypes = uniquify(
			model.fields
				.filter(
					(field) =>
						field.relationName &&
						(separateRelationFields || importSelfRelations
							? true
							: model.name !== field.type),
				)
				.map((v) => v.type + (enableDeepRelations ? postfix : '')),
		);

		const typesTypes = uniquify(
			model.fields
				.filter(
					(field) =>
						field.kind == 'object' &&
						model.name !== field.type &&
						!field.relationName,
				)
				.map((v) => v.type),
		);

		const enums = model.fields.filter((field) => field.kind === 'enum');

		classComponent.fields = model.fields
			.filter((field) => {
				if (extractRelationFields === true) {
					return field.relationName;
				}
				if (extractRelationFields === false) {
					return !field.relationName;
				}
				return true;
			})
			.map((field) =>
				this.convertField({
					...field,
					type:
						field.type +
						(field.kind === 'object' && enableDeepRelations
							? postfix
							: ''),
					skipSwaggerDecorator:
						createAggregateRoot || enableDeepRelations,
					skipGraphqlDecorator:
						createAggregateRoot || enableDeepRelations,
					modelName: model.name,
				}),
			);
		classComponent.addModelNameGetter = addModelNameGetter;
		classComponent.enableDeepRelations = enableDeepRelations;
		classComponent.relationTypes =
			extractRelationFields === false ? [] : relationTypes;

		classComponent.enumTypes =
			extractRelationFields === true
				? []
				: enums.map((field) => field.type.toString());

		classComponent.types = typesTypes;
		classComponent.model = model;

		const createGraphqlDecorators = this.config.modelsForGraphql?.length
			? this.config.modelsForGraphql.includes(model.name)
			: true;

		if (useGraphQL && createGraphqlDecorators && !createAggregateRoot) {
			const deco = new DecoratorComponent({
				name: 'ObjectType',
				importFrom: '@nestjs/graphql',
			});

			classComponent.decorators.push(deco);

			if (classComponent.enumTypes.length > 0) {
				const extra = classComponent.enumTypes
					.map(
						(enumType) => `registerEnumType(${enumType}, {
	name: "${enumType}"
})`,
					)
					.join('\r\n\r\n');

				classComponent.extra = extra;
			}
		}

		classComponent.metadata = metadata;

		if (createAggregateRoot) {
			classComponent.extends = 'AggregateRoot';
			classComponent.createAggregateRoot = true;
			classComponent.addToObjectMethodToAggregateRoot = true;
		}

		return classComponent;
	};

	/**
	 * one prisma model could generate multiple classes!
	 *
	 * CASE 1: if you want separate model to normal class and relation class
	 */
	getClasses = (): ClassComponent[] => {
		const models = this.dmmf.datamodel.models;

		const classes = [];

		/** separateRelationFields */
		if (this.config.separateRelationFields === true) {
			classes.push(
				...models.map((model) =>
					this.getClass({
						model,
						extractRelationFields: true,
						postfix: 'Relations',
						useGraphQL: this.config.useGraphQL,
						separateRelationFields:
							this.config.separateRelationFields,
					}),
				),
				...models.map((model) =>
					this.getClass({
						model,
						extractRelationFields: false,
						useGraphQL: this.config.useGraphQL,
						separateRelationFields:
							this.config.separateRelationFields,
					}),
				),
				...models.map((model) =>
					this.getClass({
						model,
						useGraphQL: this.config.useGraphQL,
						postfix: 'WithRelations',
						separateRelationFields:
							this.config.separateRelationFields,
					}),
				),

				// mongodb Types support
				...this.dmmf.datamodel.types.map((model) =>
					this.getClass({
						model,
						extractRelationFields: true,
						useGraphQL: this.config.useGraphQL,
						createAggregateRoot: this.config.createAggregateRoot,
						addToObjectMethodToAggregateRoot:
							this.config.addToObjectMethodToAggregateRoot,
						separateRelationFields:
							this.config.separateRelationFields,
					}),
				),
			);
		} else {
			classes.push(
				...models.map((model) =>
					this.getClass({
						model,
						useGraphQL: this.config.useGraphQL,
						separateRelationFields:
							this.config.separateRelationFields,
					}),
				),
				// mongodb Types support
				...this.dmmf.datamodel.types.map((model) =>
					this.getClass({
						model,
						useGraphQL: this.config.useGraphQL,
						createAggregateRoot: this.config.createAggregateRoot,
						addToObjectMethodToAggregateRoot:
							this.config.addToObjectMethodToAggregateRoot,
						separateRelationFields:
							this.config.separateRelationFields,
					}),
				),
			);
		}

		if (this.config.createAggregateRoot) {
			classes.push(
				...models.map((model) =>
					this.getClass({
						model,
						postfix: 'AggregateRoot',
						extractRelationFields: false,
						createAggregateRoot: this.config.createAggregateRoot,
						addToObjectMethodToAggregateRoot:
							this.config.addToObjectMethodToAggregateRoot,
						importSelfRelations: true,
						separateRelationFields:
							this.config.separateRelationFields,
						addModelNameGetter: this.config.addModelNameGetter,
						metadata: {
							siblingClass: `${model.name}`,
						},
					}),
				),
				...models.map((model) =>
					this.getClass({
						model,
						extractRelationFields: true,
						postfix: 'RelationsAggregateRoot',
						createAggregateRoot: this.config.createAggregateRoot,
						addToObjectMethodToAggregateRoot:
							this.config.addToObjectMethodToAggregateRoot,
						importSelfRelations: true,
						separateRelationFields:
							this.config.separateRelationFields,
						addModelNameGetter: this.config.addModelNameGetter,
						metadata: {
							siblingClass: `${model.name}Relations`,
						},
					}),
				),
				...models.map((model) =>
					this.getClass({
						model,
						postfix: 'WithRelationsAggregateRoot',
						createAggregateRoot: this.config.createAggregateRoot,
						addToObjectMethodToAggregateRoot:
							this.config.addToObjectMethodToAggregateRoot,
						separateRelationFields: false,
						importSelfRelations: true,
						addModelNameGetter: this.config.addModelNameGetter,
						metadata: {
							siblingClass: `${model.name}WithRelations`,
						},
					}),
				),
			);
		}

		if (this.config.enableDeepRelations) {
			classes.push(
				...models.map((model) =>
					this.getClass({
						model,
						postfix: 'WithDeepRelations',
						enableDeepRelations: this.config.enableDeepRelations,
					}),
				),
			);
		}

		return classes;
	};

	convertField = (
		dmmfField: DMMF.Field & ExtraFieldProps,
	): FieldComponent => {
		const field = new FieldComponent({
			name: dmmfField.name,
			useUndefinedDefault: this._config.useUndefinedDefault,
		});
		let type = this.getPrimitiveMapTypeFromDMMF(dmmfField);

		if (this.config.useSwagger && !dmmfField.skipSwaggerDecorator) {
			const decorator = this.extractSwaggerDecoratorFromField(dmmfField);
			field.decorators.push(decorator);
		}

		const createGraphqlDecorators = this.config.modelsForGraphql?.length
			? this.config.modelsForGraphql.includes(dmmfField.modelName)
			: true;

		if (
			this.config.useGraphQL &&
			createGraphqlDecorators &&
			!dmmfField.skipGraphqlDecorator
		) {
			const decorator =
				this.extractTypeGraphQLDecoratorFromField(dmmfField);
			if (decorator) {
				field.decorators.push(decorator);
			}
		}

		if (dmmfField.isRequired === false) {
			field.nullable = true;
		}

		if (this.config.useNonNullableAssertions) {
			field.nonNullableAssertion = true;
		}

		if (this.config.preserveDefaultNullable) {
			field.preserveDefaultNullable = true;
		}

		if (dmmfField.default) {
			if (typeof dmmfField.default !== 'object') {
				field.default = dmmfField.default?.toString();
				if (dmmfField.kind === 'enum') {
					field.default = `${dmmfField.type}.${dmmfField.default}`;
				} else if (dmmfField.type === 'BigInt') {
					field.default = `BigInt(${field.default})`;
				} else if (dmmfField.type === 'String') {
					field.default = `'${field.default}'`;
				}
			} else if (Array.isArray(dmmfField.default)) {
				if (dmmfField.type === 'String') {
					field.default = `[${dmmfField.default
						.map((d) => `'${d}'`)
						.toString()}]`;
				} else {
					field.default = `[${dmmfField.default.toString()}]`;
				}
			}
		}

		if (type) {
			field.type = type;
		} else {
			field.type = dmmfField.type;
		}

		if (dmmfField.isList) {
			field.type = arrayify(field.type);
		}

		return field;
	};
}
