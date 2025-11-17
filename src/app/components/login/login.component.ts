import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';
import { ODataService } from '../../services/odata.service';

interface StoredCredentials {
  url: string;
  username: string;
  password: string;
}

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
export class LoginComponent implements OnInit {
  odataUrl: string = '';
  username: string = '';
  password: string = '';
  rememberMe: boolean = false;
  errorMessage: string = '';
  loading: boolean = false;
  private readonly storageKey = 'odata-viewer-remembered-credentials';

  constructor(
    private odataService: ODataService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const storedCredentials = this.getStoredCredentials();
    if (storedCredentials) {
      this.odataUrl = storedCredentials.url;
      this.username = storedCredentials.username;
      this.password = storedCredentials.password;
      this.rememberMe = true;
      this.connect(storedCredentials.url, storedCredentials.username, storedCredentials.password, true, true);
    }
  }

  onSubmit(): void {
    if (!this.odataUrl || !this.username || !this.password) {
      this.errorMessage = 'Please fill in all fields';
      return;
    }

    const cleanUrl = this.normalizeUrl(this.odataUrl);
    if (!cleanUrl) {
      this.errorMessage = 'Please provide a valid OData URL';
      return;
    }

    this.connect(cleanUrl, this.username, this.password, this.rememberMe);
  }

  private connect(
    url: string,
    username: string,
    password: string,
    shouldRemember: boolean,
    isAutoLogin: boolean = false
  ): void {
    this.loading = true;
    this.errorMessage = '';

    this.odataService.setConnection({
      url,
      username,
      password
    });

    this.odataService.getResources().subscribe({
      next: () => {
        this.loading = false;
        if (shouldRemember) {
          this.saveCredentials({ url, username, password });
        } else {
          this.clearStoredCredentials();
        }
        this.router.navigate(['/resources']);
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = error.message || 'Failed to connect to OData service. Please check your credentials and URL.';
        if (isAutoLogin) {
          this.clearStoredCredentials();
        }
      }
    });
  }

  private normalizeUrl(url: string): string {
    return url.trim().replace(/\/$/, '');
  }

  private saveCredentials(credentials: StoredCredentials): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(credentials));
    } catch {
      // Ignore storage errors
    }
  }

  private clearStoredCredentials(): void {
    localStorage.removeItem(this.storageKey);
  }

  private getStoredCredentials(): StoredCredentials | null {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as StoredCredentials;
      if (parsed?.url && parsed?.username && parsed?.password) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }
}

