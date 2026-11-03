<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;

class RoleAccessTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite(); 
    }

    public function test_admin_can_access_admin_panel()
    {
        $admin = User::factory()->create(['role' => 'admin']);
        
        // Gunakan route('admin.index') agar URL-nya dinamis sesuai buatan tim
        $response = $this->actingAs($admin)->get(route('admin.index'));
        $response->assertStatus(200);
    }

    public function test_siswa_cannot_access_admin_panel()
    {
        $siswa = User::factory()->create(['role' => 'siswa']);
        
        $response = $this->actingAs($siswa)->get(route('admin.index'));
       // OPSI A: Cek kalau siswa dialihkan (Redirect 302) ke halaman dashboard-nya
        $response->assertRedirect(route('dashboard'));

        // OPSI B (Jika hanya ingin memastikan siswa dilarang/dialihkan tanpa peduli tujuannya):
        // $response->assertRedirect();
    }

    public function test_editor_can_access_editor_dashboard()
    {
        // Ubah 'editor' menjadi 'admin_editor'
        $editor = User::factory()->create(['role' => 'admin_editor']);
        
        $response = $this->actingAs($editor)->get(route('editor.dashboard'));
        $response->assertStatus(200);
    }
}