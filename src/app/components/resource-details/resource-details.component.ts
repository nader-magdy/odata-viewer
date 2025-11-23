import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TableModule } from 'primeng/table';
import { Subscription } from 'rxjs';
import { ODataRelatedResource, ODataService } from '../../services/odata.service';

interface RecordEntry {
  key: string;
  value: string;
  multiline: boolean;
}

interface RelatedResourceSection {
  info: ODataRelatedResource;
  rows: any[];
  columns: string[];
  loading: boolean;
  error: string;
}

@Component({
  selector: 'app-resource-details',
  standalone: true,
  imports: [
    CommonModule,
    CardModule,
    ButtonModule,
    MessageModule,
    ProgressSpinnerModule,
    TableModule
  ],
  templateUrl: './resource-details.component.html',
  styleUrl: './resource-details.component.scss'
})
export class ResourceDetailsComponent implements OnInit, OnDestroy {
  resourceName = '';
  resourceId = '';
  connectionUrl = '';
  recordEntries: RecordEntry[] = [];
  metadataEntries: { key: string; value: string }[] = [];
  loading = true;
  errorMessage = '';
  relatedResourceSections: RelatedResourceSection[] = [];
  relatedResourcesLoading = false;
  relatedResourcesError = '';
  private recordKey: string | null = null;
  private relatedResourcesSubscription?: Subscription;
  private relatedDataSubscriptions: Subscription[] = [];
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

    this.routeSubscription = this.route.paramMap.subscribe((params) => {
      this.resourceName = params.get('resourceName') ?? '';
      this.resourceId = params.get('resourceId') ?? '';
      this.initializeRecordDetails();
    });
  }

  ngOnDestroy(): void {
    this.routeSubscription?.unsubscribe();
    this.relatedResourcesSubscription?.unsubscribe();
    this.relatedDataSubscriptions.forEach((sub) => sub.unsubscribe());
    this.relatedDataSubscriptions = [];
  }

  backToResource(): void {
    if (this.resourceName) {
      this.router.navigate(['/resources', this.resourceName]);
    } else {
      this.router.navigate(['/resources']);
    }
  }

  private initializeRecordDetails(): void {
    this.loading = true;
    this.errorMessage = '';
    this.resetRelatedResourcesState();
    this.recordKey = null;

    const state = this.getNavigationState();
    const recordData = state?.['recordData'] as Record<string, unknown> | undefined;
    const metadata = state?.['metadata'] ?? recordData?.['__metadata'];

    if (!recordData || typeof recordData !== 'object') {
      this.recordEntries = [];
      this.metadataEntries = [];
      this.errorMessage = 'No record data provided. Please open the details from the resource list.';
      this.loading = false;
      return;
    }

    this.recordEntries = this.buildRecordEntries(recordData as Record<string, unknown>);
    this.metadataEntries = this.transformMetadataToEntries(metadata);
    this.recordKey = this.resolveRecordKey(recordData as Record<string, unknown>);

    this.loadRelatedResourcesData();
    this.loading = false;
  }

  private loadRelatedResourcesData(): void {
    this.resetRelatedResourcesState();

    if (!this.resourceName) {
      return;
    }

    if (!this.recordKey) {
      this.relatedResourcesError = 'Record identifier unavailable. Related data cannot be loaded.';
      return;
    }

    this.relatedResourcesLoading = true;
    this.relatedResourcesSubscription = this.odataService.getRelatedResources(this.resourceName).subscribe({
      next: (resources) => {
        this.relatedResourcesLoading = false;
        if (!resources.length) {
          this.relatedResourceSections = [];
          return;
        }

        this.relatedResourceSections = resources.map((resource) => ({
          info: resource,
          rows: [],
          columns: [],
          loading: true,
          error: ''
        }));

        this.relatedResourceSections.forEach((section) => this.fetchRelatedSection(section));
      },
      error: (error: Error) => {
        this.relatedResourcesLoading = false;
        this.relatedResourcesError = error.message || 'Failed to load related resources metadata.';
      }
    });
  }

  private fetchRelatedSection(section: RelatedResourceSection): void {
    if (!this.resourceName || !this.recordKey) {
      section.loading = false;
      section.error = 'Missing record identifier.';
      return;
    }

    const subscription = this.odataService
      .getNavigationPropertyData(this.resourceName, this.recordKey, section.info.viaProperty, { top: 5 })
      .subscribe({
        next: (result) => {
          section.rows = result.data ?? [];
          section.columns = this.extractColumns(section.rows);
          section.loading = false;
        },
        error: (error: Error) => {
          section.error = error.message || `Failed to load ${section.info.name}`;
          section.loading = false;
        }
      });

    this.relatedDataSubscriptions.push(subscription);
  }

  private getNavigationState(): Record<string, unknown> | undefined {
    const navState = this.router.getCurrentNavigation()?.extras?.state;
    if (navState && Object.keys(navState).length > 0) {
      return navState as Record<string, unknown>;
    }

    if (typeof history !== 'undefined' && history.state) {
      return history.state as Record<string, unknown>;
    }

    return undefined;
  }

  private resolveRecordKey(recordData?: Record<string, unknown>): string | null {
    const state = this.getNavigationState();
    const candidate = (state?.['recordId'] ?? this.resourceId) as string | undefined;
    const normalizedCandidate = this.normalizeRecordKey(candidate);
    if (normalizedCandidate) {
      return normalizedCandidate;
    }

    const metadata = (recordData ?? (state?.['recordData'] as Record<string, unknown> | undefined))?.['__metadata'];
    if (metadata && typeof metadata === 'object') {
      const uri = (metadata as Record<string, unknown>)['uri'];
      if (typeof uri === 'string') {
        const parsed = this.extractKeyFromMetadataUri(uri);
        if (parsed) {
          return parsed;
        }
      }
    }

    return null;
  }

  private normalizeRecordKey(value?: string): string | null {
    if (!value) {
      return null;
    }

    let decoded = value;
    try {
      decoded = decodeURIComponent(value);
    } catch {
      decoded = value;
    }

    let trimmed = decoded.trim();
    if (!trimmed) {
      return null;
    }

    if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
      trimmed = trimmed.slice(1, -1);
    }

    return trimmed || null;
  }

  private extractKeyFromMetadataUri(uri: string): string | null {
    const match = /\((.+)\)\s*$/.exec(uri);
    return match?.[1] ?? null;
  }
  private resetRelatedResourcesState(): void {
    this.relatedResourcesLoading = false;
    this.relatedResourcesError = '';
    this.relatedResourceSections = [];
    this.relatedResourcesSubscription?.unsubscribe();
    this.relatedResourcesSubscription = undefined;
    this.relatedDataSubscriptions.forEach((sub) => sub.unsubscribe());
    this.relatedDataSubscriptions = [];
  }

  viewRelatedResource(resourceName: string): void {
    if (!resourceName) {
      return;
    }
    this.router.navigate(['/resources', resourceName]);
  }

  private extractColumns(data: any[]): string[] {
    if (!Array.isArray(data) || data.length === 0) {
      return [];
    }

    const columnSet = new Set<string>();
    data.forEach((row) => {
      if (row && typeof row === 'object') {
        Object.keys(row).forEach((key) => columnSet.add(key));
      }
    });

    return Array.from(columnSet);
  }

  private buildRecordEntries(record: Record<string, unknown>): RecordEntry[] {
    return Object.entries(record)
      .filter(([key]) => key !== '__metadata')
      .map(([key, value]) => {
        const formatted = this.formatValue(value);
        return {
          key,
          value: formatted,
          multiline: /\n/.test(formatted)
        };
      })
      .sort((a, b) => a.key.localeCompare(b.key));
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
      return value;
    }

    if (typeof value === 'object') {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    }

    return String(value);
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
}

