import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { MessageModule } from 'primeng/message';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TableModule } from 'primeng/table';
import type { TableLazyLoadEvent } from 'primeng/table';
import { Subscription } from 'rxjs';
import { ODataService, type CountStrategy } from '../../services/odata.service';

@Component({
  selector: 'app-resource-data',
  standalone: true,
  imports: [
    CommonModule,
    CardModule,
    ButtonModule,
    MessageModule,
    DialogModule,
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
  totalRecords = 0;
  pageSize = 25;
  dataInitialized = false;
  countStrategy: CountStrategy | 'none' = 'inlinecount';
  metadataDialogVisible = false;
  selectedMetadata: unknown = null;

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
    this.metadataDialogVisible = true;
  }

  closeMetadataDialog(): void {
    this.metadataDialogVisible = false;
    this.selectedMetadata = null;
  }

  private loadResourceData(resource: string, lazyEvent?: TableLazyLoadEvent, isRetry = false): void {
    const first = lazyEvent?.first ?? 0;
    const resolvedPageSize = lazyEvent?.rows && lazyEvent.rows > 0 ? lazyEvent.rows : this.pageSize;

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
      countStrategy: countStrategyParam
    }).subscribe({
      next: ({ data, total }) => {
        this.rows = data;
        this.columns = this.extractColumns(data).filter(column => column !== '__metadata');

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
    this.loading = true;
    this.closeMetadataDialog();
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

