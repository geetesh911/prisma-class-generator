import { Echoable } from '../interfaces/echoable';
import { FieldComponent } from './field.component';
import { CLASS_TEMPLATE } from '../templates/class.template';
import { BaseComponent } from './base.component';
import { DMMF } from '@prisma/generator-helper';

export class ClassComponent extends BaseComponent implements Echoable {
	name: string;
	model: DMMF.Model;
	fields?: FieldComponent[];
	relationTypes?: string[];
	enumTypes?: string[] = [];
	extra?: string = '';
	extends?: string = '';
	createAggregateRoot?: boolean = false;
	addToObjectMethodToAggregateRoot?: boolean = false;
	types?: string[];

	echo = () => {
		const fieldContent = this.fields.map((_field) => _field.echo());
		const toObjectStr =
			this.createAggregateRoot && this.addToObjectMethodToAggregateRoot
				? `toObject(): Omit<${this.name}, 'toObject'> {
			return {
				${this.fields
					.map((_field) => `${_field.name}: this.${_field.name},\n`)
					.join('')}
			};
		}`
				: '';

		let str = CLASS_TEMPLATE.replace(
			'#!{DECORATORS}',
			this.echoDecorators(),
		)
			.replace('#!{NAME}', `${this.name}`)
			.replace('#!{FIELDS}', fieldContent.join('\r\n'))
			.replace('#!{EXTRA}', this.extra)
			.replace('#!{TO_OBJECT_METHOD}', toObjectStr)
			.replace(
				'#!{EXTENDS}',
				this.extends ? `extends ${this.extends}` : '',
			);

		return str;
	};

	reExportPrefixed = (prefix: string) => {
		return `export class ${this.name} extends ${prefix}${this.name} {}`;
	};
}
