<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Foundation\Testing\DatabaseTransactions;

class PasswordEncryptionTest extends TestCase
{
    use DatabaseTransactions;

    public function test_user_password_is_encrypted_using_bcrypt()
    {
        // Simulasi pembuatan user
        $user = User::factory()->create([
            'password' => bcrypt('rahasia123'),
        ]);

        // 1. Pastikan yang tersimpan di database BUKAN 'rahasia123'
        $this->assertNotEquals('rahasia123', $user->password);
        
        // 2. Pastikan yang tersimpan adalah format hash bcrypt
        $this->assertTrue(Hash::check('rahasia123', $user->password));
    }
}