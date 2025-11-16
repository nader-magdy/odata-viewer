import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'resources',
    loadComponent: () => import('./components/resources/resources.component').then(m => m.ResourcesComponent)
  },
  {
    path: 'resources/:resourceName',
    loadComponent: () => import('./components/resource-data/resource-data.component').then(m => m.ResourceDataComponent)
  },
  {
    path: '**',
    redirectTo: ''
  }
];
