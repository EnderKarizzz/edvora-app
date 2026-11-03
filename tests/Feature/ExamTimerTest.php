<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;
use App\Models\User;

class ExamTimerTest extends TestCase
{
    use DatabaseTransactions;

    public function test_exam_timer_synchronization_endpoint()
    {
        $student = User::where('email', 'sim001@simulasi.test')->first();

        if (!$student) {
            $this->markTestSkipped('Akun siswa uji coba belum tersedia di database.');
        }

        $response = $this->actingAs($student)->get('/ujian'); 

        $response->assertStatus(200);

        
    }
}