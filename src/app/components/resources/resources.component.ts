import { Component, OnInit } from '@angular/core';
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
export class ResourcesComponent implements OnInit {
  resources: ODataResource[] = [];
  filteredResources: ODataResource[] = [];
  loading: boolean = true;
  errorMessage: string = '';
  connectionUrl: string = '';
  searchTerm: string = '';

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

  loadResources(): void {
    this.loading = true;
    this.errorMessage = '';

    this.odataService.getResources().subscribe({
      next: (resources) => {
        this.resources = resources;
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

  private applyFilter(): void {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) {
      this.filteredResources = [...this.resources];
      return;
    }

    this.filteredResources = this.resources.filter((resource) => {
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
}

