import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';
import { MessageModule } from 'primeng/message';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TooltipModule } from 'primeng/tooltip';
import { InputTextModule } from 'primeng/inputtext';
import { FormsModule } from '@angular/forms';
import { ODataService, ODataResource } from '../../services/odata.service';
import { Subscription } from 'rxjs';

interface ResourceSnapshot {
  connectionUrl?: string;
  generatedAt?: string;
  resources?: Partial<ODataResource>[];
}

@Component({
  selector: 'app-resources',
  standalone: true,
  imports: [
    CommonModule,
    TableModule,
    ButtonModule,
    CardModule,
    TagModule,
    MessageModule,
    ProgressSpinnerModule,
    TooltipModule,
    InputTextModule,
    FormsModule
  ],
  templateUrl: './resources.component.html',
  styleUrl: './resources.component.scss'
})
export class ResourcesComponent implements OnInit, OnDestroy {
  resources: ODataResource[] = [];
  filteredResources: ODataResource[] = [];
  loading: boolean = true;
  errorMessage: string = '';
  connectionUrl: string = '';
  searchTerm: string = '';
  isCheckingAccessibility: boolean = false;
  showAccessibleOnly: boolean = false;
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;
  private accessibilitySubscriptions: Subscription[] = [];
  private pendingAccessibilityChecks = 0;
  checkedAccessibilityCount: number = 0;
  totalAccessibilityChecks: number = 0;

  constructor(
    private odataService: ODataService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const connection = this.odataService.getConnection();
    if (!connection) {
      this.router.navigate(['/']);
      return;
    }

    this.connectionUrl = connection.url;
    this.loadResources();
  }

  ngOnDestroy(): void {
    this.resetAccessibilityState();
  }

  loadResources(): void {
    this.loading = true;
    this.errorMessage = '';
    this.resetAccessibilityState();

    this.odataService.getResources().subscribe({
      next: (resources) => {
        this.resources = resources.map((resource) => ({
          ...resource,
          accessible: null
        }));
        this.applyFilter();
        this.loading = false;
      },
      error: (error) => {
        this.errorMessage = error.message || 'Failed to load resources';
        this.loading = false;
      }
    });
  }

  onSearchTermChange(): void {
    this.applyFilter();
  }

  onAccessibleFilterChange(): void {
    this.applyFilter();
  }

  triggerAccessibilityCheck(): void {
    if (this.isCheckingAccessibility || this.resources.length === 0) {
      return;
    }

    this.startAccessibilityChecks();
  }

  downloadResourcesSnapshot(): void {
    if (this.resources.length === 0) {
      return;
    }

    const snapshot = {
      connectionUrl: this.connectionUrl,
      generatedAt: new Date().toISOString(),
      resources: this.resources
    };

    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.download = `odata-resources-${timestamp}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  openSnapshotUpload(): void {
    this.fileInput?.nativeElement.click();
  }

  onSnapshotFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string) as ResourceSnapshot;
        this.loadSnapshotData(parsed);
      } catch {
        this.errorMessage = 'Invalid resources snapshot file';
      } finally {
        input.value = '';
      }
    };

    reader.onerror = () => {
      this.errorMessage = 'Failed to read snapshot file';
      input.value = '';
    };

    reader.readAsText(file);
  }

  private applyFilter(): void {
    const term = this.searchTerm.trim().toLowerCase();
    this.filteredResources = this.resources.filter((resource) => {
      if (this.showAccessibleOnly && resource.accessible !== true) {
        return false;
      }

      if (!term) {
        return true;
      }

      const nameMatch = resource.name?.toLowerCase().includes(term);
      const kindMatch = resource.kind?.toLowerCase().includes(term);
      const urlMatch = resource.url?.toLowerCase().includes(term);
      return nameMatch || kindMatch || urlMatch;
    });
  }

  getSeverity(kind: string): 'success' | 'secondary' | 'info' | 'warn' | 'danger' | 'contrast' | undefined | null {
    switch (kind) {
      case 'EntitySet':
        return 'success';
      case 'EntityType':
        return 'info';
      case 'FunctionImport':
        return 'warn';
      default:
        return 'secondary';
    }
  }

  disconnect(): void {
    this.router.navigate(['/']);
  }

  openResource(resource: ODataResource): void {
    this.router.navigate(['/resources', resource.name]);
  }

  private startAccessibilityChecks(): void {
    if (this.resources.length === 0) {
      return;
    }

    this.clearAccessibilitySubscriptions();
    this.isCheckingAccessibility = true;
    this.pendingAccessibilityChecks = this.resources.length;
    this.totalAccessibilityChecks = this.resources.length;
    this.checkedAccessibilityCount = 0;

    this.resources.forEach((resource) => {
      resource.accessible = null;
      const subscription = this.odataService.checkResourceAccessibility(resource).subscribe({
        next: (accessible) => {
          resource.accessible = accessible;
          this.applyFilter();
        },
        error: () => {
          resource.accessible = false;
          this.applyFilter();
        }
      });

      subscription.add(() => this.handleAccessibilityCompletion());
      this.accessibilitySubscriptions.push(subscription);
    });

    this.applyFilter();
  }

  private loadSnapshotData(snapshot: ResourceSnapshot): void {
    if (!snapshot || !Array.isArray(snapshot.resources)) {
      throw new Error('Invalid snapshot data');
    }

    const sanitized = snapshot.resources
      .map((resource) => this.sanitizeResource(resource))
      .filter((resource): resource is ODataResource => !!resource);

    this.resetAccessibilityState();

    if (snapshot.connectionUrl) {
      this.connectionUrl = snapshot.connectionUrl;
    }

    this.resources = sanitized;
    this.applyFilter();
    this.loading = false;
    this.errorMessage = '';
  }

  private sanitizeResource(resource: Partial<ODataResource> | undefined | null): ODataResource | null {
    if (!resource || !resource.name || !resource.kind || !resource.url) {
      return null;
    }

    return {
      name: resource.name,
      kind: resource.kind,
      url: resource.url,
      accessible: typeof resource.accessible === 'boolean' ? resource.accessible : null
    };
  }

  private handleAccessibilityCompletion(): void {
    this.pendingAccessibilityChecks = Math.max(this.pendingAccessibilityChecks - 1, 0);
    this.checkedAccessibilityCount = Math.min(
      this.checkedAccessibilityCount + 1,
      this.totalAccessibilityChecks
    );
    if (this.pendingAccessibilityChecks === 0) {
      this.isCheckingAccessibility = false;
    }
  }

  private resetAccessibilityState(): void {
    this.isCheckingAccessibility = false;
    this.pendingAccessibilityChecks = 0;
    this.checkedAccessibilityCount = 0;
    this.totalAccessibilityChecks = 0;
    this.clearAccessibilitySubscriptions();
  }

  private clearAccessibilitySubscriptions(): void {
    this.accessibilitySubscriptions.forEach((sub) => sub.unsubscribe());
    this.accessibilitySubscriptions = [];
  }
}

