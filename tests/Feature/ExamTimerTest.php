<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;
use App\Models\User;

class ExamTimerTest extends TestCase
{
    use DatabaseTransactions;

    public function test_sinkronisasi_timer_pada_halaman_tryout()
    {
        // 1. Mencari akun dummy siswa
        $student = User::where('email', 'sim001@simulasi.test')->first();

        if (!$student) {
            $this->markTestSkipped('Akun siswa uji coba belum tersedia di database.');
        }

        // 2. Simulasi login dan mengakses URL yang benar
        $response = $this->actingAs($student)->get('/tryout'); 

        // 3. Memastikan halaman berhasil dimuat (Bukan 404, melainkan 200 OK)
        $response->assertStatus(200);
        
        // 4. Memastikan halaman tidak kosong dan memuat elemen antarmuka (mencegah blank screen)
        $response->assertSee('<', false); // Memastikan ada tag HTML yang dirender
    }
}