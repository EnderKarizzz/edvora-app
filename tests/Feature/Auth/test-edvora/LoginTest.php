<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;

class LoginTest extends TestCase
{
    use DatabaseTransactions; // Wajib untuk tim

    public function test_user_can_login_with_correct_credentials()
    {
        $user = User::factory()->create([
            'email' => 'sim001@simulasi.test',
            'password' => bcrypt('SimulasiEdvora2026'),
        ]);

        $response = $this->post('/login', [
            'email' => 'sim001@simulasi.test',
            'password' => 'SimulasiEdvora2026',
        ]);

        $this->assertAuthenticatedAs($user);
        $response->assertRedirect('/dashboard');
    }

    public function test_user_cannot_login_with_incorrect_password()
    {
        $user = User::factory()->create([
            'email' => 'sim001@simulasi.test',
            'password' => bcrypt('SimulasiEdvora2026'),
        ]);

        $response = $this->post('/login', [
            'email' => 'sim001@simulasi.test',
            'password' => 'salahpassword',
        ]);

        $this->assertGuest(); // Memastikan user tetap belum login (Guest)
    }
}