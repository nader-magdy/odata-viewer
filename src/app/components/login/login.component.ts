import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';
import { ODataService } from '../../services/odata.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    CardModule,
    MessageModule
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  odataUrl: string = '';
  username: string = '';
  password: string = '';
  errorMessage: string = '';
  loading: boolean = false;

  constructor(
    private odataService: ODataService,
    private router: Router
  ) {}

  onSubmit(): void {
    if (!this.odataUrl || !this.username || !this.password) {
      this.errorMessage = 'Please fill in all fields';
      return;
    }

    // Clean up URL (remove trailing slash if present)
    const cleanUrl = this.odataUrl.trim().replace(/\/$/, '');

    this.loading = true;
    this.errorMessage = '';

    // Set connection
    this.odataService.setConnection({
      url: cleanUrl,
      username: this.username,
      password: this.password
    });

    // Test connection by fetching resources
    this.odataService.getResources().subscribe({
      next: () => {
        this.loading = false;
        this.router.navigate(['/resources']);
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = error.message || 'Failed to connect to OData service. Please check your credentials and URL.';
      }
    });
  }
}

