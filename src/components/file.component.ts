import { paramCase } from 'change-case';
import { ClassComponent } from './class.component';
import * as path from 'path';
import { getRelativeTSPath, prettierFormat, writeTSFile } from '../util';
import { PrismaClassGenerator } from '../generator';
import { Echoable } from '../interfaces/echoable';
import { ImportComponent } from './import.component';

export class FileComponent implements Echoable {
	private _dir?: string;
	private _filename?: string;
	private _foldername?: string;
	private _imports?: ImportComponent[] = [];
	private _prismaClass: ClassComponent;
	static TEMP_PREFIX = '__TEMPORARY_CLASS_PATH__';

	public get dir() {
		return this._dir;
	}

	public set dir(value) {
		this._dir = value;
	}

	public get filename() {
		return this._filename;
	}

	public set filename(value) {
		this._filename = value;
	}

	public get foldername() {
		return this._foldername;
	}

	public set foldername(value) {
		this._foldername = value;
	}

	public get imports() {
		return this._imports;
	}

	public set imports(value) {
		this._imports = value;
	}

	public get prismaClass() {
		return this._prismaClass;
	}

	public set prismaClass(value) {
		this._prismaClass = value;
	}

	constructor(input: { classComponent: ClassComponent; output: string }) {
		const { classComponent, output } = input;
		this._prismaClass = classComponent;
		this.dir = path.resolve(output);
		this.filename = `${paramCase(classComponent.name)}.ts`;
		this.foldername = paramCase(classComponent.model.name);
		this.resolveImports();
	}

	echoImports = () => {
		return this.imports
			.reduce((result, importRow) => {
				result.push(importRow.echo());
				return result;
			}, [])
			.join('\r\n');
	};

	echo = () => {
		return this.prismaClass
			.echo()
			.replace('#!{IMPORTS}', this.echoImports());
	};

	registerImport(item: string, from: string) {
		const oldIndex = this.imports.findIndex(
			(_import) => _import.from === from,
		);
		if (oldIndex > -1) {
			this.imports[oldIndex].add(item);
			return;
		}
		this.imports.push(new ImportComponent(from, item));
	}

	resolveImports() {
		const generator = PrismaClassGenerator.getInstance();

		if (generator.getConfig().useGraphQL) {
			this.registerImport('ID', '@nestjs/graphql');
			this.registerImport('Int', '@nestjs/graphql');
			this.registerImport('registerEnumType', '@nestjs/graphql');
			this.registerImport('GraphQLJSON', 'graphql-type-json');
		}

		if (this.prismaClass.createAggregateRoot) {
			this.registerImport('AggregateRoot', '@nestjs/cqrs');
		}

		this.prismaClass.decorators.forEach((decorator) => {
			this.registerImport(decorator.name, decorator.importFrom);
		});

		this.prismaClass.fields.forEach((field) => {
			field.decorators.forEach((decorator) => {
				this.registerImport(decorator.name, decorator.importFrom);
			});
		});

		this.prismaClass.enumTypes.forEach((enumName) => {
			this.registerImport(enumName, generator.getClientImportPath());
		});

		this.prismaClass.relationTypes.forEach((relationClassName) => {
			this.registerImport(
				`${relationClassName}`,
				FileComponent.TEMP_PREFIX + relationClassName,
			);
		});

		if (this.prismaClass.types) {
			this.prismaClass.types.forEach((type) => {
				this.registerImport(type, './' + type.toLowerCase());
			});
		}
	}

	write(dryRun: boolean) {
		const generator = PrismaClassGenerator.getInstance();
		const filePath = path.resolve(
			this.dir + '/' + this.foldername,
			this.filename,
		);
		const content = prettierFormat(this.echo(), generator.prettierOptions);
		writeTSFile(filePath, content, dryRun);
	}

	getRelativePath(to: string): string {
		return getRelativeTSPath(this.getPath(), to);
	}

	getPath() {
		return path.resolve(this.dir + '/' + this.foldername, this.filename);
	}
}
