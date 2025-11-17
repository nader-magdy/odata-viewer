import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TableModule } from 'primeng/table';
import type { TableLazyLoadEvent } from 'primeng/table';
import { Subscription } from 'rxjs';
import type { FilterMetadata, SortMeta } from 'primeng/api';
import { ODataService, type CountStrategy, type ODataRelatedResource } from '../../services/odata.service';

type ColumnValueType = 'string' | 'number' | 'boolean' | 'date' | 'object';

@Component({
  selector: 'app-resource-data',
  standalone: true,
  imports: [
    CommonModule,
    CardModule,
    ButtonModule,
    MessageModule,
    DialogModule,
    InputTextModule,
    ProgressSpinnerModule,
    TableModule
  ],
  templateUrl: './resource-data.component.html',
  styleUrl: './resource-data.component.scss'
})
export class ResourceDataComponent implements OnInit, OnDestroy {
  resourceName = '';
  connectionUrl = '';
  loading = true;
  errorMessage = '';
  rows: any[] = [];
  columns: string[] = [];
  allColumns: string[] = [];
  columnSelection: Record<string, boolean> = {};
  totalRecords = 0;
  pageSize = 25;
  dataInitialized = false;
  countStrategy: CountStrategy | 'none' = 'inlinecount';
  columnTypes: Record<string, ColumnValueType> = {};
  metadataDialogVisible = false;
  selectedMetadata: unknown = null;
  metadataEntries: { key: string; value: string }[] = [];
  relatedResourcesDialogVisible = false;
  columnOptionsDialogVisible = false;

  relatedResourcesLoading = false;
  relatedResourcesError = '';
  relatedResources: ODataRelatedResource[] = [];
  private relatedResourcesLoadedFor: string | null = null;

  private routeSubscription?: Subscription;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly odataService: ODataService
  ) {}

  ngOnInit(): void {
    const connection = this.odataService.getConnection();
    if (!connection) {
      this.router.navigate(['/']);
      return;
    }

    this.connectionUrl = connection.url;

    this.routeSubscription = this.route.paramMap.subscribe((params: ParamMap) => {
      const resource = params.get('resourceName');
      if (!resource) {
        this.errorMessage = 'No resource selected.';
        this.loading = false;
        return;
      }

      this.resourceName = resource;
      this.resetResourceState();
      this.loadResourceData(resource);
    });
  }

  ngOnDestroy(): void {
    this.routeSubscription?.unsubscribe();
  }

  backToResources(): void {
    this.router.navigate(['/resources']);
  }

  formatValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'string') {
      const parsedDate = this.parseODataDate(value);
      if (parsedDate) {
        return parsedDate;
      }
    }

    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }

    return String(value);
  }

  trackColumn(index: number, column: string): string {
    return column ?? String(index);
  }

  onLazyLoad(event: TableLazyLoadEvent): void {
    if (!this.resourceName) {
      return;
    }

    this.loadResourceData(this.resourceName, event);
  }

  openMetadataDialog(metadata: unknown): void {
    this.selectedMetadata = metadata;
    this.metadataEntries = this.transformMetadataToEntries(metadata);
    this.metadataDialogVisible = true;
  }

  closeMetadataDialog(): void {
    this.metadataDialogVisible = false;
    this.selectedMetadata = null;
    this.metadataEntries = [];
  }

  openColumnOptionsDialog(): void {
    this.columnOptionsDialogVisible = true;
  }

  closeColumnOptionsDialog(): void {
    this.columnOptionsDialogVisible = false;
  }

  openRelatedResourcesDialog(): void {
    this.relatedResourcesDialogVisible = true;
    this.fetchRelatedResources();
  }

  closeRelatedResourcesDialog(): void {
    this.relatedResourcesDialogVisible = false;
  }

  viewRelatedResource(resourceName: string): void {
    if (!resourceName) {
      return;
    }
    this.router.navigate(['/resources', resourceName]);
  }

  private loadResourceData(resource: string, lazyEvent?: TableLazyLoadEvent, isRetry = false): void {
    const first = lazyEvent?.first ?? 0;
    const resolvedPageSize = lazyEvent?.rows && lazyEvent.rows > 0 ? lazyEvent.rows : this.pageSize;
    const orderByClause = this.buildOrderByClause(lazyEvent);
    const filterClause = this.buildFilterClause(lazyEvent);

    if (lazyEvent?.rows && lazyEvent.rows > 0) {
      this.pageSize = lazyEvent.rows;
    }

    if (!isRetry) {
      this.closeMetadataDialog();
    }
    this.loading = true;
    this.errorMessage = '';

    const shouldIncludeCount = this.countStrategy !== 'none' && (!this.dataInitialized || first === 0);
    const countStrategyParam: CountStrategy | undefined =
      shouldIncludeCount && this.countStrategy !== 'none'
        ? (this.countStrategy === 'inlinecount' ? 'inlinecount' : 'count')
        : undefined;

    this.odataService.getResourceData(resource, {
      skip: first,
      top: resolvedPageSize,
      includeCount: shouldIncludeCount,
      countStrategy: countStrategyParam,
      orderBy: orderByClause,
      filter: filterClause
    }).subscribe({
      next: ({ data, total }) => {
        this.rows = data;
        const extractedColumns = this.extractColumns(data).filter(column => column !== '__metadata');
        this.allColumns = extractedColumns;
        this.syncColumnSelection(extractedColumns);
        this.columns = this.getVisibleColumns();
        this.updateColumnTypes(data);

        if (typeof total === 'number' && !Number.isNaN(total)) {
          this.totalRecords = total;
        } else if (!this.dataInitialized) {
          this.totalRecords = data.length;
        } else if (this.countStrategy === 'none') {
          const estimatedTotal = first + data.length;
          if (estimatedTotal > this.totalRecords) {
            this.totalRecords = estimatedTotal;
          }
        }

        if (!this.dataInitialized) {
          this.dataInitialized = true;
        }

        this.loading = false;
      },
      error: (error: Error) => {
        if (this.handleCountStrategyError(resource, lazyEvent, error)) {
          return;
        }

        const message = this.extractServerErrorMessage(error);
        this.errorMessage = message || `Failed to load resource data for ${resource}`;
        this.loading = false;
      }
    });
  }

  private resetResourceState(): void {
    this.rows = [];
    this.columns = [];
    this.totalRecords = 0;
    this.pageSize = 25;
    this.dataInitialized = false;
    this.countStrategy = 'inlinecount';
    this.columnTypes = {};
    this.columns = [];
    this.allColumns = [];
    this.columnSelection = {};
    this.loading = true;
    this.closeMetadataDialog();
    this.columnOptionsDialogVisible = false;
    this.relatedResources = [];
    this.relatedResourcesError = '';
    this.relatedResourcesLoading = false;
    this.relatedResourcesDialogVisible = false;
    this.relatedResourcesLoadedFor = null;
  }

  private buildOrderByClause(event?: TableLazyLoadEvent): string | undefined {
    if (!event) {
      return undefined;
    }

    const multiSortMeta = event.multiSortMeta as SortMeta[] | undefined;
    if (multiSortMeta?.length) {
      const fragments = multiSortMeta
        .map(meta => this.createOrderByFragment(meta?.field, meta?.order))
        .filter((fragment): fragment is string => !!fragment);
      if (fragments.length > 0) {
        return fragments.join(',');
      }
    }

    const sortField = Array.isArray(event.sortField) ? event.sortField[0] : event.sortField;
    if (sortField) {
      const fragment = this.createOrderByFragment(sortField, event.sortOrder);
      if (fragment) {
        return fragment;
      }
    }

    return undefined;
  }

  private createOrderByFragment(field?: string | null, order?: number | null | undefined): string | null {
    if (!field) {
      return null;
    }
    const sanitizedField = this.sanitizeFieldName(field);
    if (!sanitizedField) {
      return null;
    }

    const direction = order === -1 ? 'desc' : 'asc';
    return `${sanitizedField} ${direction}`;
  }

  private buildFilterClause(event?: TableLazyLoadEvent): string | undefined {
    if (!event?.filters) {
      return undefined;
    }

    const clauses: string[] = [];

    Object.entries(event.filters).forEach(([field, metadata]) => {
      const sanitizedField = this.sanitizeFieldName(field);
      if (!sanitizedField) {
        return;
      }

      const metadataEntries = Array.isArray(metadata) ? metadata : [metadata];
      metadataEntries.forEach((entry) => {
        const clause = this.filterMetadataToClause(
          sanitizedField,
          entry as FilterMetadata,
          this.getFieldType(field)
        );
        if (clause) {
          clauses.push(clause);
        }
      });
    });

    return clauses.length > 0 ? clauses.join(' and ') : undefined;
  }

  private filterMetadataToClause(
    field: string,
    metadata: FilterMetadata | null | undefined,
    fieldType: ColumnValueType
  ): string | null {
    if (!metadata) {
      return null;
    }

    const { value } = metadata;
    if (value === undefined || value === null || value === '') {
      return null;
    }

    if (fieldType === 'object') {
      return null;
    }

    const normalizedMatchMode = this.normalizeMatchMode(metadata.matchMode, fieldType);
    const literal = this.convertValueToLiteral(value, fieldType);

    switch (normalizedMatchMode) {
      case 'startsWith':
        return `startswith(${field},${literal})`;
      case 'endsWith':
        return `endswith(${field},${literal})`;
      case 'equals':
        return `${field} eq ${literal}`;
      case 'notEquals':
        return `${field} ne ${literal}`;
      case 'contains':
        return `substringof(${literal},${field})`;
      default:
        return `${field} eq ${literal}`;
    }
  }

  private convertValueToLiteral(value: unknown, fieldType: ColumnValueType = 'string'): string {
    if (fieldType === 'number') {
      const numericValue = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(numericValue) ? String(numericValue) : '0';
    }

    if (fieldType === 'boolean') {
      const boolValue = typeof value === 'boolean'
        ? value
        : String(value).toLowerCase() === 'true' || value === 1 || value === '1';
      return boolValue ? 'true' : 'false';
    }

    if (fieldType === 'date') {
      const dateValue = value instanceof Date ? value : new Date(String(value));
      return Number.isNaN(dateValue.getTime()) ? `''` : `'${dateValue.toISOString()}'`;
    }

    if (typeof value === 'number') {
      if (Number.isFinite(value)) {
        return String(value);
      }
      return '0';
    }

    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }

    if (value instanceof Date) {
      return `'${value.toISOString()}'`;
    }

    return `'${String(value).replace(/'/g, "''")}'`;
  }

  private sanitizeFieldName(field: string): string {
    return field?.replace(/[^A-Za-z0-9_\/\.]/g, '');
  }

  private updateColumnTypes(data: any[]): void {
    if (!Array.isArray(data) || data.length === 0) {
      return;
    }

    const nextTypes: Record<string, ColumnValueType> = { ...this.columnTypes };

    this.columns.forEach((column) => {
      const detectedType = this.detectColumnType(data, column);
      if (detectedType) {
        nextTypes[column] = detectedType;
        const sanitized = this.sanitizeFieldName(column);
        if (sanitized && sanitized !== column) {
          nextTypes[sanitized] = detectedType;
        }
      }
    });

    this.columnTypes = nextTypes;
  }

  private transformMetadataToEntries(metadata: unknown): { key: string; value: string }[] {
    if (metadata === null || metadata === undefined) {
      return [];
    }

    if (typeof metadata === 'string') {
      const parsed = this.tryParseJson(metadata);
      if (parsed !== null) {
        return this.transformMetadataToEntries(parsed);
      }
      return [{ key: 'value', value: metadata }];
    }

    if (Array.isArray(metadata)) {
      return metadata.map((item, index) => ({
        key: `[${index}]`,
        value: this.stringifyMetadataValue(item)
      }));
    }

    if (typeof metadata === 'object') {
      return Object.entries(metadata as Record<string, unknown>).map(([key, value]) => ({
        key,
        value: this.stringifyMetadataValue(value)
      }));
    }

    return [{ key: 'value', value: String(metadata) }];
  }

  private stringifyMetadataValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'string') {
      const parsed = this.tryParseJson(value);
      if (parsed !== null) {
        return JSON.stringify(parsed, null, 2);
      }
      return value;
    }

    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }

    return String(value);
  }

  private tryParseJson(value: string): unknown | null {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  private syncColumnSelection(columns: string[]): void {
    const nextSelection: Record<string, boolean> = { ...this.columnSelection };

    columns.forEach((column) => {
      if (!(column in nextSelection)) {
        nextSelection[column] = true;
      }
    });

    Object.keys(nextSelection).forEach((key) => {
      if (!columns.includes(key)) {
        delete nextSelection[key];
      }
    });

    this.columnSelection = nextSelection;
  }

  private getVisibleColumns(): string[] {
    return this.allColumns.filter((column) => this.columnSelection[column] !== false);
  }

  onColumnToggle(column: string, event: Event): void {
    const checkbox = event.target as HTMLInputElement;
    this.columnSelection[column] = checkbox.checked;
    this.columns = this.getVisibleColumns();
  }

  selectAllColumns(): void {
    this.allColumns.forEach((column) => {
      this.columnSelection[column] = true;
    });
    this.columns = this.getVisibleColumns();
  }

  clearAllColumns(): void {
    this.allColumns.forEach((column) => {
      this.columnSelection[column] = false;
    });
    this.columns = this.getVisibleColumns();
  }

  private fetchRelatedResources(): void {
    if (!this.resourceName || this.relatedResourcesLoading) {
      return;
    }

    if (this.relatedResourcesLoadedFor === this.resourceName && this.relatedResources.length > 0) {
      return;
    }

    this.relatedResourcesLoading = true;
    this.relatedResourcesError = '';

    this.odataService.getRelatedResources(this.resourceName).subscribe({
      next: (resources) => {
        this.relatedResources = resources;
        this.relatedResourcesLoading = false;
        this.relatedResourcesLoadedFor = this.resourceName;
      },
      error: (error: Error) => {
        this.relatedResourcesError = error.message || 'Failed to load related resources';
        this.relatedResourcesLoading = false;
      }
    });
  }

  private detectColumnType(data: any[], column: string): ColumnValueType | null {
    for (const row of data) {
      if (row && typeof row === 'object' && column in row) {
        const detected = this.detectValueType(row[column]);
        if (detected) {
          return detected;
        }
      }
    }

    return null;
  }

  private detectValueType(value: unknown): ColumnValueType | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'number') {
      return 'number';
    }

    if (typeof value === 'boolean') {
      return 'boolean';
    }

    if (value instanceof Date) {
      return 'date';
    }

    if (typeof value === 'string') {
      return this.isIsoDateString(value) ? 'date' : 'string';
    }

    if (typeof value === 'object') {
      return 'object';
    }

    return 'string';
  }

  private isIsoDateString(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value);
  }

  private getFieldType(field: string): ColumnValueType {
    const sanitized = this.sanitizeFieldName(field);
    return this.columnTypes[field] ?? (sanitized ? this.columnTypes[sanitized] : undefined) ?? 'string';
  }

  private normalizeMatchMode(matchMode: string | undefined, fieldType: ColumnValueType): 'startsWith' | 'endsWith' | 'contains' | 'equals' | 'notEquals' {
    if (fieldType === 'number' || fieldType === 'boolean' || fieldType === 'date') {
      return matchMode === 'notEquals' ? 'notEquals' : 'equals';
    }

    switch (matchMode) {
      case 'startsWith':
      case 'endsWith':
      case 'equals':
      case 'notEquals':
      case 'contains':
        return matchMode;
      case 'is':
        return 'equals';
      default:
        return 'contains';
    }
  }

  private handleCountStrategyError(resource: string, lazyEvent: TableLazyLoadEvent | undefined, error: Error): boolean {
    if (!error) {
      return false;
    }

    const message = this.extractServerErrorMessage(error).toLowerCase();

    if (!message) {
      return false;
    }

    if (this.countStrategy === 'count' && message.includes('$count') && message.includes('not a valid')) {
      this.countStrategy = 'inlinecount';
      this.loadResourceData(resource, lazyEvent, true);
      return true;
    }

    if (this.countStrategy === 'inlinecount' && message.includes('$inlinecount') && message.includes('not a valid')) {
      this.countStrategy = 'none';
      this.loadResourceData(resource, lazyEvent, true);
      return true;
    }

    return false;
  }

  private extractServerErrorMessage(error: Error): string {
    if (!error) {
      return '';
    }

    const httpError = error as any;
    return (
      httpError?.error?.error?.message?.value ??
      httpError?.error?.message?.value ??
      httpError?.error?.message ??
      error.message ??
      ''
    );
  }

  private extractColumns(data: any[]): string[] {
    const columnSet = new Set<string>();

    data.forEach((row) => {
      if (row && typeof row === 'object') {
        Object.keys(row).forEach((key) => columnSet.add(key));
      }
    });

    return Array.from(columnSet.values());
  }

  private parseODataDate(value: string): string | null {
    const match = /^\/Date\((\d+)\)\/$/.exec(value);
    if (!match) {
      return null;
    }

    const timestamp = Number(match[1]);
    if (Number.isNaN(timestamp)) {
      return null;
    }

    return new Date(timestamp).toLocaleString();
  }
}

