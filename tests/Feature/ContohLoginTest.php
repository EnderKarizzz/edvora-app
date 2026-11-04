<?php

namespace Tests\Feature;

use Tests\TestCase;
use Illuminate\Foundation\Testing\DatabaseTransactions; // ✅ Wajib sesuai aturan tim

class ContohLoginTest extends TestCase
{
    use DatabaseTransactions; // ✅ Mencegah data di Supabase terhapus

    public function test_halaman_login_bisa_diakses()
    {
        $response = $this->get('/login');

        $response->assertStatus(200);
    }
}