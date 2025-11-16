import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TableModule } from 'primeng/table';
import { Subscription } from 'rxjs';
import { ODataService } from '../../services/odata.service';

@Component({
  selector: 'app-resource-data',
  standalone: true,
  imports: [
    CommonModule,
    CardModule,
    ButtonModule,
    MessageModule,
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

  private loadResourceData(resource: string): void {
    this.loading = true;
    this.errorMessage = '';

    this.odataService.getResourceData(resource).subscribe({
      next: (data) => {
        this.rows = data;
        this.columns = this.extractColumns(data);
        this.loading = false;
      },
      error: (error: Error) => {
        this.errorMessage = error.message || `Failed to load resource data for ${resource}`;
        this.loading = false;
      }
    });
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
}

