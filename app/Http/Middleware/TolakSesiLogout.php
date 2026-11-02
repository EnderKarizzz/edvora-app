<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class TolakSesiLogout
{
    public static function tandai(string $idSesi): void
    {
        // Dinonaktifkan sementara untuk pengujian
    }

    public function handle(Request $request, Closure $next): Response
    {
        return $next($request);
    }

    private static function kunci(string $idSesi): string
    {
        return 'sesi_logout:' . $idSesi;
    }
}
