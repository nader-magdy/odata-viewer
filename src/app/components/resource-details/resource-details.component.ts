import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TableModule } from 'primeng/table';
import { ODataService } from '../../services/odata.service';

interface RecordEntry {
  key: string;
  value: string;
  multiline: boolean;
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
export class ResourceDetailsComponent implements OnInit {
  resourceName = '';
  resourceId = '';
  connectionUrl = '';
  recordEntries: RecordEntry[] = [];
  metadataEntries: { key: string; value: string }[] = [];
  loading = true;
  errorMessage = '';

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

    this.route.paramMap.subscribe((params) => {
      this.resourceName = params.get('resourceName') ?? '';
      this.resourceId = params.get('resourceId') ?? '';
      this.initializeRecordDetails();
    });
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
    this.loading = false;
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

