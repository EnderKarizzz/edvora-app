<?php

use App\Http\Middleware\HandleInertiaRequests;
use App\Http\Middleware\PastikanBiodataLengkap;
use App\Http\Middleware\PastikanPeran;
use App\Http\Middleware\TolakSesiLogout;
use Illuminate\Contracts\Auth\Middleware\AuthenticatesRequests;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Symfony\Component\HttpFoundation\Response;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->web(append: [
            TolakSesiLogout::class,
            HandleInertiaRequests::class,
            AddLinkHeadersForPreloadedAssets::class,
        ]);

        // Laravel mengurutkan middleware auth lebih awal dari middleware web tambahan;
        // TolakSesiLogout harus tetap mendahuluinya agar user dari sesi yang sudah logout tidak sempat dimuat.
        $middleware->prependToPriorityList(AuthenticatesRequests::class, TolakSesiLogout::class);

        // Dipasang di rute setelah form Biodata frontend terhubung (rancangan 10.6).
        $middleware->alias([
            'biodata.lengkap' => PastikanBiodataLengkap::class,
            // Membatasi rute per role, mis. 'peran:admin,admin_editor'.
            'peran' => PastikanPeran::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        // Logout dengan token lama padahal sudah tidak login (tab lain, sesi habis, klik saat halaman berpindah):
        // tujuannya sudah tercapai, jadi ke beranda, bukan Page Expired. Yang masih login tetap 419.
        $exceptions->respond(function (Response $response, Throwable $e, Request $request) {
            if ($response->getStatusCode() === 419 && $request->routeIs('logout') && Auth::guest()) {
                return Inertia::location(url('/'));
            }

            return $response;
        });
    })->create();
